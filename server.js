/*
 * Practical - 8: CivicGrid backend — Node.js + Express + MySQL
 * Replaces the browser Local Storage with MySQL for:
 *   - registration, login and sessions            (users, sessions)
 *   - complaint creation incl. the uploaded photo (complaints.image LONGBLOB)
 *   - Kanban drag & drop / list status changes    (complaints.status + complaint_status_history)
 *
 * Start:  npm start   then open http://localhost:3000
 */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { initDatabase, closeConnection } = require('./connection/setup');
const { query, transaction } = require('./connection/db');
const { selectAll, deleteRecord } = require('./connection/crud');
const { explainDbError } = require('./connection/config');

const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = 'civicgrid_session';
const SESSION_DAYS = 7;
const STATUSES = ['reported', 'inprogress', 'resolved'];
const GENDERS = ['Male', 'Female', 'Other'];

const app = express();
app.use(express.json());

// Uploaded images are kept in memory and written straight into MySQL
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(png|jpe?g|gif|webp)$/.test(file.mimetype)) return cb(null, true);
        cb(new HttpError(400, 'Only PNG, JPEG, GIF or WebP images are allowed.'));
    }
});

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// =======================================================
// AUTH HELPERS — password hashing and cookie sessions
// =======================================================

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    const expected = Buffer.from(hash, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
}

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) return decodeURIComponent(rest.join('='));
    }
    return null;
}

function setSessionCookie(res, token, maxAgeSeconds) {
    res.setHeader('Set-Cookie',
        `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`);
}

function toUser(row) {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        mobileNumber: row.mobile_number,
        aadharNumber: row.aadhar_number,
        emailId: row.email,
        address: row.address
    };
}

// Attach req.user when the session cookie is valid, otherwise respond 401
async function requireAuth(req, res, next) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
        const rows = await query(
            `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
             WHERE s.token = ? AND s.expires_at > NOW()`, [token]);
        if (rows.length) {
            req.user = rows[0];
            req.sessionToken = token;
            return next();
        }
    }
    res.status(401).json({ error: 'Please sign in.' });
}

// =======================================================
// AUTH ROUTES — register, login, current user, logout
// =======================================================

app.post('/api/auth/register', async (req, res) => {
    const b = req.body || {};
    const user = {
        firstName: String(b.firstName || '').trim(),
        lastName: String(b.lastName || '').trim(),
        mobileNumber: String(b.mobileNumber || '').trim(),
        aadharNumber: String(b.aadharNumber || '').trim(),
        emailId: String(b.emailId || '').trim().toLowerCase(),
        password: String(b.password || ''),
        address: String(b.address || '').trim()
    };

    if (!user.firstName || !user.lastName || !user.address) throw new HttpError(400, 'Please fill in all fields.');
    if (!/^\d{10}$/.test(user.mobileNumber)) throw new HttpError(400, 'Mobile number must be 10 digits.');
    if (!/^\d{12}$/.test(user.aadharNumber)) throw new HttpError(400, 'Aadhar number must be 12 digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.emailId)) throw new HttpError(400, 'Please enter a valid email.');
    if (user.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

    try {
        await query(
            `INSERT INTO users (first_name, last_name, mobile_number, aadhar_number, email, password_hash, address)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [user.firstName, user.lastName, user.mobileNumber, user.aadharNumber,
             user.emailId, hashPassword(user.password), user.address]);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            throw new HttpError(409, /aadhar/.test(err.message)
                ? 'A user with this Aadhar number already exists!'
                : 'User with this Email ID already exists!');
        }
        throw err;
    }
    res.status(201).json({ message: 'Registration successful.' });
});

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.emailId || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length || !verifyPassword(password, rows[0].password_hash)) {
        throw new HttpError(401, 'Invalid Email ID or Password. Please try again.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    await query('DELETE FROM sessions WHERE expires_at <= NOW()');
    await query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
        [token, rows[0].id, SESSION_DAYS]);

    setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
    res.json({ user: toUser(rows[0]) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: toUser(req.user) });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
    await deleteRecord('sessions', { token: req.sessionToken });
    setSessionCookie(res, '', 0);
    res.json({ message: 'Signed out.' });
});

// =======================================================
// COMPLAINT ROUTES — list, create (with image), status change, delete
// =======================================================

const COMPLAINT_COLUMNS = `
    c.id, c.user_id, c.description, z.name AS zone_name, c.reporter_name, c.reporter_aadhar,
    c.reporter_age, c.reporter_gender, c.reporter_residence, c.status, c.location_label,
    c.latitude, c.longitude, c.image IS NOT NULL AS has_image, c.created_at, c.updated_at`;

// Shape a DB row like the task objects the frontend already renders
function toTask(r) {
    return {
        id: r.id,
        text: r.description,
        area: r.zone_name,
        reporterDetails: {
            name: r.reporter_name,
            aadhar: r.reporter_aadhar,
            age: r.reporter_age,
            gender: r.reporter_gender,
            residence: r.reporter_residence
        },
        image: r.has_image ? `/api/complaints/${r.id}/image` : null,
        completed: r.status === 'resolved',
        status: r.status,
        location: r.location_label,
        coords: r.latitude != null ? { lat: Number(r.latitude), lng: Number(r.longitude) } : null,
        createdBy: r.user_id,
        createdAt: new Date(r.created_at).getTime()
    };
}

async function getComplaint(id) {
    const rows = await query(
        `SELECT ${COMPLAINT_COLUMNS} FROM complaints c JOIN zones z ON z.id = c.zone_id WHERE c.id = ?`, [id]);
    if (!rows.length) throw new HttpError(404, 'Complaint not found.');
    return rows[0];
}

app.get('/api/zones', requireAuth, async (req, res) => {
    res.json(await selectAll('zones', { orderBy: 'id' }));
});

app.get('/api/complaints', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT ${COMPLAINT_COLUMNS} FROM complaints c JOIN zones z ON z.id = c.zone_id ORDER BY c.created_at, c.id`);
    res.json(rows.map(toTask));
});

app.post('/api/complaints', requireAuth, upload.single('image'), async (req, res) => {
    const b = req.body || {};
    const text = String(b.text || '').trim();
    const name = String(b.reporterName || '').trim();
    const aadhar = String(b.reporterAadhar || '').trim();
    const age = Number(b.reporterAge);
    const gender = String(b.reporterGender || '');
    const residence = String(b.reporterResidence || '').trim();

    if (!text || !name || !residence) throw new HttpError(400, 'Please fill in all reporter and issue details.');
    if (text.length > 500) throw new HttpError(400, 'Issue description is too long (max 500 characters).');
    if (!/^\d{12}$/.test(aadhar)) throw new HttpError(400, 'Aadhar number must be 12 digits.');
    if (!Number.isInteger(age) || age < 1 || age > 120) throw new HttpError(400, 'Please enter a valid age.');
    if (!GENDERS.includes(gender)) throw new HttpError(400, 'Please select a gender.');

    const zones = await query('SELECT * FROM zones WHERE name = ?', [String(b.area || '')]);
    if (!zones.length) throw new HttpError(400, 'Please select a valid area.');
    const zone = zones[0];

    // Use the pin/GPS coordinates when given, else fall back to the zone centre
    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const file = req.file;

    const id = await transaction(async (q) => {
        const result = await q(
            `INSERT INTO complaints
                (user_id, zone_id, description, reporter_name, reporter_aadhar, reporter_age,
                 reporter_gender, reporter_residence, location_label, latitude, longitude,
                 image, image_mime, image_name)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.id, zone.id, text, name, aadhar, age, gender, residence,
             String(b.location || '').trim() || zone.name,
             hasCoords ? lat : zone.lat, hasCoords ? lng : zone.lng,
             file ? file.buffer : null, file ? file.mimetype : null, file ? file.originalname : null]);
        await q(
            `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, changed_by, source)
             VALUES (?, NULL, 'reported', ?, 'create')`, [result.insertId, req.user.id]);
        return result.insertId;
    });

    res.status(201).json(toTask(await getComplaint(id)));
});

// Serve the photo stored in MySQL
app.get('/api/complaints/:id/image', requireAuth, async (req, res) => {
    const rows = await query('SELECT image, image_mime FROM complaints WHERE id = ?', [req.params.id]);
    if (!rows.length || !rows[0].image) throw new HttpError(404, 'Image not found.');
    res.set('Content-Type', rows[0].image_mime || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(rows[0].image);
});

// Drag & drop on the Kanban board and Complete/Undo in the list both land here
app.patch('/api/complaints/:id/status', requireAuth, async (req, res) => {
    const status = req.body?.status;
    const source = req.body?.source === 'kanban' ? 'kanban' : 'list';
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');

    await transaction(async (q) => {
        const rows = await q('SELECT status FROM complaints WHERE id = ? FOR UPDATE', [req.params.id]);
        if (!rows.length) throw new HttpError(404, 'Complaint not found.');
        if (rows[0].status === status) return;

        await q('UPDATE complaints SET status = ? WHERE id = ?', [status, req.params.id]);
        await q(
            `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, changed_by, source)
             VALUES (?, ?, ?, ?, ?)`, [req.params.id, rows[0].status, status, req.user.id, source]);
    });

    res.json(toTask(await getComplaint(req.params.id)));
});

app.get('/api/complaints/:id/history', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT h.old_status, h.new_status, h.source, h.changed_at,
                CONCAT(u.first_name, ' ', u.last_name) AS changed_by
         FROM complaint_status_history h LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.complaint_id = ? ORDER BY h.changed_at, h.id`, [req.params.id]);
    res.json(rows);
});

app.delete('/api/complaints/:id', requireAuth, async (req, res) => {
    const deleted = await deleteRecord('complaints', { id: req.params.id });
    if (!deleted) throw new HttpError(404, 'Complaint not found.');
    res.json({ message: 'Complaint removed.' });
});

// =======================================================
// STATIC FRONTEND — HTML pages, app.js and bootstrap (never the server code)
// =======================================================

app.use((req, res, next) => {
    if (/^\/(connection|node_modules|server\.js|package(-lock)?\.json)/i.test(req.path)) {
        return res.status(404).end();
    }
    next();
});
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(__dirname, { dotfiles: 'ignore', index: false }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Central error handler (Express 5 forwards rejected async handlers here)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : err.message });
    }
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
});

// =======================================================
// START — make sure DB + tables exist, then listen
// =======================================================

initDatabase({ log: msg => console.log('[db] ' + msg) })
    .then(conn => closeConnection(conn, () => {}))
    .then(() => {
        app.listen(PORT, () => console.log(`CivicGrid running at http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error(explainDbError(err));
        process.exit(1);
    });
