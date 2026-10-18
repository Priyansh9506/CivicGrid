/*
 * Practical - 9: CivicGrid — Role-Based Authentication and Access Control (RBAC) Backend
 * Built with Node.js, Express, and MySQL.
 *
 * Implements:
 *   - 3 System Roles: Citizen (1), Field Officer (2), Administrator (3)
 *   - Fine-grained Permissions & Middleware: requireAuth, requireRole, requirePermission
 *   - RBAC protected endpoints:
 *       * Status updates (Kanban drag & drop / List): Officers & Admins only
 *       * Complaint deletion: Admins (all) or Citizens (own complaints only)
 *       * User Management & Role Switching: Admins only
 *       * Fast 1-click Demo Role Switcher for live viva evaluation
 *
 * Start: npm start  -> http://localhost:3000
 */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { initDatabase, closeConnection } = require('./connection/setup');
const { query, transaction } = require('./connection/db');
const { selectAll, deleteRecord } = require('./connection/crud');
const { explainDbError } = require('./connection/config');
const {
    ROLES,
    ROLE_LIST,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_METADATA,
    DEMO_USERS,
    hasPermission
} = require('./connection/rbac');

// Practical 10: MongoDB CRUD Modules
const {
    createOne: mongoCreateOne,
    createMany: mongoCreateMany,
    readAll: mongoReadAll,
    readOne: mongoReadOne,
    readById: mongoReadById,
    readDistinct: mongoReadDistinct,
    updateOneRecord: mongoUpdateOne,
    updateById: mongoUpdateById,
    deleteById: mongoDeleteById,
    aggregateRecords: mongoAggregate
} = require('./connection/mongo-crud');
const { connectMongo } = require('./connection/mongo-db');

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
// AUTH & RBAC HELPERS — hashing, sessions & access control
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
    const role = row.role || ROLES.CITIZEN;
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        mobileNumber: row.mobile_number,
        aadharNumber: row.aadhar_number,
        emailId: row.email,
        role: role,
        roleMeta: ROLE_METADATA[role] || ROLE_METADATA[ROLES.CITIZEN],
        permissions: ROLE_PERMISSIONS[role] || [],
        address: row.address
    };
}

// Authenticates current session cookie and attaches req.user
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

// RBAC Middleware: Enforces that the user has at least one of the allowed roles
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        const userRole = req.user.role || ROLES.CITIZEN;
        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: `Access Denied: Requires role [${allowedRoles.join(' or ')}]. Your current role is [${userRole}].`,
                requiredRoles: allowedRoles,
                userRole
            });
        }
        next();
    };
}

// RBAC Middleware: Enforces that the user's role has a specific fine-grained permission
function requirePermission(permission) {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
        const userRole = req.user.role || ROLES.CITIZEN;
        if (hasPermission(userRole, permission)) return next();
        return res.status(403).json({
            error: `Access Denied: Role '${userRole}' lacks permission '${permission}'.`,
            requiredPermission: permission,
            userRole
        });
    };
}

// =======================================================
// AUTH ROUTES — register, login, me, roles, logout & demo switcher
// =======================================================

app.post('/api/auth/register', async (req, res) => {
    const b = req.body || {};
    const role = ROLE_LIST.includes(b.role) ? b.role : ROLES.CITIZEN;
    const user = {
        firstName: String(b.firstName || '').trim(),
        lastName: String(b.lastName || '').trim(),
        mobileNumber: String(b.mobileNumber || '').trim(),
        aadharNumber: String(b.aadharNumber || '').trim(),
        emailId: String(b.emailId || '').trim().toLowerCase(),
        password: String(b.password || ''),
        address: String(b.address || '').trim(),
        role
    };

    if (!user.firstName || !user.lastName || !user.address) throw new HttpError(400, 'Please fill in all fields.');
    if (!/^\d{10}$/.test(user.mobileNumber)) throw new HttpError(400, 'Mobile number must be 10 digits.');
    if (!/^\d{12}$/.test(user.aadharNumber)) throw new HttpError(400, 'Aadhar number must be 12 digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.emailId)) throw new HttpError(400, 'Please enter a valid email.');
    if (user.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

    try {
        await query(
            `INSERT INTO users (first_name, last_name, mobile_number, aadhar_number, email, password_hash, role, address)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [user.firstName, user.lastName, user.mobileNumber, user.aadharNumber,
             user.emailId, hashPassword(user.password), user.role, user.address]);
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

// Returns the full RBAC roles and permissions schema for UI rendering
app.get('/api/auth/roles', (req, res) => {
    res.json({
        roles: ROLE_LIST,
        metadata: ROLE_METADATA,
        permissions: ROLE_PERMISSIONS,
        allPermissions: Object.values(PERMISSIONS)
    });
});

// 1-Click Demo Role Switcher (Practical 9 viva & evaluation helper)
app.post('/api/auth/switch-demo-role', async (req, res) => {
    const targetRole = req.body?.role;
    if (!ROLE_LIST.includes(targetRole)) throw new HttpError(400, 'Invalid role.');

    const rows = await query('SELECT * FROM users WHERE role = ? ORDER BY id LIMIT 1', [targetRole]);
    if (!rows.length) throw new HttpError(404, `No demo account found for role ${targetRole}.`);

    const user = rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    await query('DELETE FROM sessions WHERE expires_at <= NOW()');
    await query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, NOW() + INTERVAL ? DAY)',
        [token, user.id, SESSION_DAYS]);

    setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
    res.json({
        message: `Active session switched to ${ROLE_METADATA[targetRole].name}`,
        user: toUser(user)
    });
});

// =======================================================
// COMPLAINT ROUTES — with RBAC checks
// =======================================================

const COMPLAINT_COLUMNS = `
    c.id, c.user_id, c.description, z.name AS zone_name, c.reporter_name, c.reporter_aadhar,
    c.reporter_age, c.reporter_gender, c.reporter_residence, c.status, c.location_label,
    c.latitude, c.longitude, c.image IS NOT NULL AS has_image, c.created_at, c.updated_at,
    u.role AS creator_role, CONCAT(u.first_name, ' ', u.last_name) AS creator_name`;

// Shape a DB row like the task objects the frontend renders
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
        creatorName: r.creator_name || null,
        creatorRole: r.creator_role || 'citizen',
        createdAt: new Date(r.created_at).getTime()
    };
}

async function getComplaint(id) {
    const rows = await query(
        `SELECT ${COMPLAINT_COLUMNS}
         FROM complaints c
         JOIN zones z ON z.id = c.zone_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE c.id = ?`, [id]);
    if (!rows.length) throw new HttpError(404, 'Complaint not found.');
    return rows[0];
}

app.get('/api/zones', requireAuth, async (req, res) => {
    res.json(await selectAll('zones', { orderBy: 'id' }));
});

// All authenticated users can view complaints feed
app.get('/api/complaints', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT ${COMPLAINT_COLUMNS}
         FROM complaints c
         JOIN zones z ON z.id = c.zone_id
         LEFT JOIN users u ON u.id = c.user_id
         ORDER BY c.created_at DESC, c.id DESC`);
    res.json(rows.map(toTask));
});

// All authenticated roles (Citizen, Officer, Admin) can create complaints
app.post('/api/complaints', requireAuth, requirePermission(PERMISSIONS.COMPLAINT_CREATE), upload.single('image'), async (req, res) => {
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

// Photo retrieval
app.get('/api/complaints/:id/image', requireAuth, async (req, res) => {
    const rows = await query('SELECT image, image_mime FROM complaints WHERE id = ?', [req.params.id]);
    if (!rows.length || !rows[0].image) throw new HttpError(404, 'Image not found.');
    res.set('Content-Type', rows[0].image_mime || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(rows[0].image);
});

// RBAC Protected Status Updates: Only Officers and Admins can advance status on Kanban or List
app.patch('/api/complaints/:id/status', requireAuth, requireRole(ROLES.OFFICER, ROLES.ADMIN), async (req, res) => {
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

// Complaint Status Audit Trail
app.get('/api/complaints/:id/history', requireAuth, async (req, res) => {
    const rows = await query(
        `SELECT h.old_status, h.new_status, h.source, h.changed_at,
                CONCAT(u.first_name, ' ', u.last_name) AS changed_by,
                u.role AS changer_role
         FROM complaint_status_history h
         LEFT JOIN users u ON u.id = h.changed_by
         WHERE h.complaint_id = ? ORDER BY h.changed_at DESC, h.id DESC`, [req.params.id]);
    res.json(rows);
});

// RBAC Protected Deletion:
// - Admin: can delete any complaint
// - Citizen: can delete ONLY their own reported complaint
// - Officer: cannot delete complaints (preserves official audit records)
app.delete('/api/complaints/:id', requireAuth, async (req, res) => {
    const complaint = await getComplaint(req.params.id);
    const userRole = req.user.role || ROLES.CITIZEN;
    const isOwner = complaint.user_id === req.user.id;

    if (userRole === ROLES.ADMIN) {
        // Universal delete permission
    } else if (userRole === ROLES.CITIZEN && isOwner) {
        // Citizen deleting their own complaint
    } else if (userRole === ROLES.CITIZEN && !isOwner) {
        throw new HttpError(403, 'Access Denied: Citizens are only permitted to delete their own reported complaints.');
    } else {
        throw new HttpError(403, 'Access Denied: Field Officers cannot delete complaints. Contact an Administrator.');
    }

    const deleted = await deleteRecord('complaints', { id: req.params.id });
    if (!deleted) throw new HttpError(404, 'Complaint not found.');
    res.json({ message: 'Complaint removed.' });
});

// =======================================================
// ADMIN MANAGEMENT ROUTES (Protected by requireRole(ADMIN))
// =======================================================

// List all registered system users and their roles
app.get('/api/admin/users', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const rows = await query(
        `SELECT u.id, u.first_name, u.last_name, u.mobile_number, u.aadhar_number,
                u.email, u.role, u.address, u.created_at,
                COUNT(c.id) AS complaints_count
         FROM users u
         LEFT JOIN complaints c ON c.user_id = u.id
         GROUP BY u.id
         ORDER BY u.id`
    );
    res.json(rows.map(r => ({
        id: r.id,
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        mobile: r.mobile_number,
        aadhar: r.aadhar_number,
        role: r.role,
        roleMeta: ROLE_METADATA[r.role] || ROLE_METADATA[ROLES.CITIZEN],
        address: r.address,
        complaintsCount: Number(r.complaints_count || 0),
        createdAt: r.created_at
    })));
});

// Update a user's role (Admin only)
app.patch('/api/admin/users/:id/role', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const targetId = parseInt(req.params.id);
    const newRole = req.body?.role;
    if (!ROLE_LIST.includes(newRole)) throw new HttpError(400, 'Invalid role.');

    const existing = await query('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!existing.length) throw new HttpError(404, 'User not found.');

    // Prevent demoting the last remaining admin
    if (existing[0].role === ROLES.ADMIN && newRole !== ROLES.ADMIN) {
        const [{ adminCount }] = await query("SELECT COUNT(*) AS adminCount FROM users WHERE role = 'admin'");
        if (adminCount <= 1) {
            throw new HttpError(400, 'Cannot demote the only remaining Administrator.');
        }
    }

    await query('UPDATE users SET role = ? WHERE id = ?', [newRole, targetId]);
    const [updated] = await query('SELECT * FROM users WHERE id = ?', [targetId]);
    res.json({
        message: `Role for ${updated.email} updated to ${newRole}`,
        user: toUser(updated)
    });
});

// Recent system audit log
app.get('/api/admin/audit', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const rows = await query(
        `SELECT h.id, h.complaint_id, c.description, h.old_status, h.new_status, h.source, h.changed_at,
                CONCAT(u.first_name, ' ', u.last_name) AS actor_name, u.email AS actor_email, u.role AS actor_role
         FROM complaint_status_history h
         JOIN complaints c ON c.id = h.complaint_id
         LEFT JOIN users u ON u.id = h.changed_by
         ORDER BY h.changed_at DESC, h.id DESC
         LIMIT 50`
    );
    res.json(rows);
});

// =======================================================
// PRACTICAL - 10: MONGODB CRUD REST API ROUTES
// =======================================================
const MONGO_COLLECTION = 'civic_complaints';

// Ensure MongoDB is connected for Mongo API routes
async function ensureMongo(req, res, next) {
    try {
        await connectMongo();
        next();
    } catch (err) {
        res.status(503).json({
            error: 'MongoDB service unavailable. Ensure MongoDB is running on port 27017.',
            details: err.message
        });
    }
}

// 1. READ ALL (with optional filters: ?area=...&status=...&priority=...)
app.get('/api/mongo/complaints', ensureMongo, async (req, res) => {
    const filter = {};
    if (req.query.area) filter.area = String(req.query.area);
    if (req.query.status) filter.status = String(req.query.status);
    if (req.query.priority) filter.priority = String(req.query.priority);

    const complaints = await mongoReadAll(MONGO_COLLECTION, { filter, sort: { createdAt: -1 } });
    res.json(complaints);
});

// 2. READ ONE BY ID
app.get('/api/mongo/complaints/:id', ensureMongo, async (req, res) => {
    const doc = await mongoReadById(MONGO_COLLECTION, req.params.id);
    if (!doc) throw new HttpError(404, 'MongoDB complaint not found.');
    res.json(doc);
});

// 3. CREATE (INSERT ONE)
app.post('/api/mongo/complaints', ensureMongo, async (req, res) => {
    const b = req.body || {};
    if (!b.description || !b.area) {
        throw new HttpError(400, 'Description and Area are required fields.');
    }
    const doc = {
        description: String(b.description).trim(),
        area: String(b.area).trim(),
        priority: b.priority || 'Medium',
        status: b.status || 'reported',
        reporter: b.reporter || { name: 'Anonymous', mobile: '' },
        location: b.location || { label: b.area },
        tags: Array.isArray(b.tags) ? b.tags : []
    };
    const result = await mongoCreateOne(MONGO_COLLECTION, doc);
    res.status(201).json(result);
});

// 4. CREATE BATCH (INSERT MANY)
app.post('/api/mongo/complaints/batch', ensureMongo, async (req, res) => {
    const list = req.body?.complaints;
    if (!Array.isArray(list) || list.length === 0) {
        throw new HttpError(400, 'Requires a JSON body with non-empty "complaints" array.');
    }
    const result = await mongoCreateMany(MONGO_COLLECTION, list);
    res.status(201).json(result);
});

// 5. UPDATE (BY ID)
app.patch('/api/mongo/complaints/:id', ensureMongo, async (req, res) => {
    const updates = req.body || {};
    delete updates._id; // Prevent updating immutable _id
    const result = await mongoUpdateById(MONGO_COLLECTION, req.params.id, updates);
    if (result.matchedCount === 0) throw new HttpError(404, 'MongoDB complaint not found.');
    const updated = await mongoReadById(MONGO_COLLECTION, req.params.id);
    res.json({ message: 'Document updated successfully.', document: updated });
});

// 6. DELETE (BY ID)
app.delete('/api/mongo/complaints/:id', ensureMongo, async (req, res) => {
    const result = await mongoDeleteById(MONGO_COLLECTION, req.params.id);
    if (result.deletedCount === 0) throw new HttpError(404, 'MongoDB complaint not found.');
    res.json({ message: 'Complaint deleted from MongoDB successfully.' });
});

// 7. AGGREGATE / STATS (Area & Status grouping)
app.get('/api/mongo/stats', ensureMongo, async (req, res) => {
    const areaStats = await mongoAggregate(MONGO_COLLECTION, [
        { $group: { _id: '$area', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);
    const statusStats = await mongoAggregate(MONGO_COLLECTION, [
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    res.json({ byArea: areaStats, byStatus: statusStats });
});

// =======================================================
// STATIC FRONTEND & ERROR HANDLING
// =======================================================

app.use((req, res, next) => {
    if (/^\/(connection|node_modules|server\.js|package(-lock)?\.json)/i.test(req.path)) {
        return res.status(404).end();
    }
    next();
});
app.get('/', (req, res) => res.redirect('/login.html'));
app.use(express.static(__dirname, { dotfiles: 'ignore', index: false }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

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
// START SERVER
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
