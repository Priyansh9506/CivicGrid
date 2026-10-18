/*
 * Practical - 10: CivicGrid — Full-Stack Node.js Application Powered by MongoDB
 *
 * Implements:
 *   - MongoDB native database backend (sessions, users, zones, complaints, status history)
 *   - 3 System Roles: Citizen (1), Field Officer (2), Administrator (3)
 *   - Fine-grained RBAC Middlewares: requireAuth, requireRole, requirePermission
 *   - Protected Endpoints:
 *       * Status updates (Kanban drag & drop / List): Officers & Admins only
 *       * Complaint deletion: Admins (all) or Citizens (own complaints only)
 *       * User Management & Role Switching: Admins only
 *       * Fast 1-click Demo Role Switcher for live viva evaluation
 *   - Full CRUD REST API for MongoDB under /api/mongo/*
 *
 * Start: npm start  -> http://localhost:3000
 */

const crypto = require('crypto');
const express = require('express');
const multer = require('multer');

const { initDatabase } = require('./connection/setup');
const { getDb, connectMongo, ObjectId } = require('./connection/mongo-db');
const { explainMongoError } = require('./connection/mongo-config');
const {
    ROLES,
    ROLE_LIST,
    PERMISSIONS,
    ROLE_PERMISSIONS,
    ROLE_METADATA,
    DEMO_USERS,
    hasPermission
} = require('./connection/rbac');

// Practical 10: User-defined MongoDB CRUD Module
const {
    createOne: mongoCreateOne,
    createMany: mongoCreateMany,
    readAll: mongoReadAll,
    readOne: mongoReadOne,
    readById: mongoReadById,
    updateOneRecord: mongoUpdateOne,
    updateById: mongoUpdateById,
    deleteById: mongoDeleteById,
    aggregateRecords: mongoAggregate
} = require('./connection/mongo-crud');

const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = 'civicgrid_session';
const SESSION_DAYS = 7;
const STATUSES = ['reported', 'inprogress', 'resolved'];
const GENDERS = ['Male', 'Female', 'Other'];

const app = express();
app.use(express.json());

// Uploaded images are kept in memory and saved into MongoDB BSON documents
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

function toObjectId(id) {
    if (!id) return null;
    if (id instanceof ObjectId) return id;
    if (typeof id === 'string' && ObjectId.isValid(id)) {
        return new ObjectId(id);
    }
    return id;
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
    if (!stored || !stored.includes(':')) return false;
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

function toUser(doc) {
    if (!doc) return null;
    const role = doc.role || ROLES.CITIZEN;
    return {
        id: doc._id.toString(),
        firstName: doc.first_name,
        lastName: doc.last_name,
        mobileNumber: doc.mobile_number,
        aadharNumber: doc.aadhar_number,
        emailId: doc.email,
        role: role,
        roleMeta: ROLE_METADATA[role] || ROLE_METADATA[ROLES.CITIZEN],
        permissions: ROLE_PERMISSIONS[role] || [],
        address: doc.address
    };
}

// Authenticates current session cookie and attaches req.user from MongoDB
async function requireAuth(req, res, next) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
        const db = getDb();
        const session = await db.collection('sessions').findOne({
            token,
            expires_at: { $gt: new Date() }
        });
        if (session) {
            const user = await db.collection('users').findOne({ _id: session.user_id });
            if (user) {
                req.user = user;
                req.sessionToken = token;
                return next();
            }
        }
    }
    res.status(401).json({ error: 'Please sign in.' });
}

// RBAC Middleware: Enforces allowed roles
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

// RBAC Middleware: Enforces fine-grained permission
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
        first_name: String(b.firstName || '').trim(),
        last_name: String(b.lastName || '').trim(),
        mobile_number: String(b.mobileNumber || '').trim(),
        aadhar_number: String(b.aadharNumber || '').trim(),
        email: String(b.emailId || '').trim().toLowerCase(),
        password: String(b.password || ''),
        address: String(b.address || '').trim(),
        role
    };

    if (!user.first_name || !user.last_name || !user.address) throw new HttpError(400, 'Please fill in all fields.');
    if (!/^\d{10}$/.test(user.mobile_number)) throw new HttpError(400, 'Mobile number must be 10 digits.');
    if (!/^\d{12}$/.test(user.aadhar_number)) throw new HttpError(400, 'Aadhar number must be 12 digits.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new HttpError(400, 'Please enter a valid email.');
    if (user.password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

    const db = getDb();
    const existingEmail = await db.collection('users').findOne({ email: user.email });
    if (existingEmail) throw new HttpError(409, 'User with this Email ID already exists!');

    const existingAadhar = await db.collection('users').findOne({ aadhar_number: user.aadhar_number });
    if (existingAadhar) throw new HttpError(409, 'A user with this Aadhar number already exists!');

    await db.collection('users').insertOne({
        first_name: user.first_name,
        last_name: user.last_name,
        mobile_number: user.mobile_number,
        aadhar_number: user.aadhar_number,
        email: user.email,
        password_hash: hashPassword(user.password),
        role: user.role,
        address: user.address,
        created_at: new Date(),
        updated_at: new Date()
    });

    res.status(201).json({ message: 'Registration successful.' });
});

app.post('/api/auth/login', async (req, res) => {
    const email = String(req.body?.emailId || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const db = getDb();
    const user = await db.collection('users').findOne({ email });
    if (!user || !verifyPassword(password, user.password_hash)) {
        throw new HttpError(401, 'Invalid Email ID or Password. Please try again.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    await db.collection('sessions').deleteMany({ expires_at: { $lte: new Date() } });
    await db.collection('sessions').insertOne({
        token,
        user_id: user._id,
        created_at: new Date(),
        expires_at: expiresAt
    });

    setSessionCookie(res, token, SESSION_DAYS * 24 * 60 * 60);
    res.json({ user: toUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: toUser(req.user) });
});

app.post('/api/auth/logout', requireAuth, async (req, res) => {
    const db = getDb();
    await db.collection('sessions').deleteOne({ token: req.sessionToken });
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


// =======================================================
// COMPLAINT ROUTES — with MongoDB & RBAC checks
// =======================================================

function toTask(r) {
    if (!r) return null;
    const docId = r._id ? r._id.toString() : r.id;
    return {
        id: docId,
        text: r.description,
        area: r.zone_name,
        reporterDetails: {
            name: r.reporter_name,
            aadhar: r.reporter_aadhar,
            age: r.reporter_age,
            gender: r.reporter_gender,
            residence: r.reporter_residence
        },
        image: r.has_image ? `/api/complaints/${docId}/image` : null,
        completed: r.status === 'resolved',
        status: r.status,
        location: r.location_label,
        coords: r.latitude != null ? { lat: Number(r.latitude), lng: Number(r.longitude) } : null,
        createdBy: r.user_id ? r.user_id.toString() : null,
        creatorName: r.creator_name || null,
        creatorRole: r.creator_role || 'citizen',
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now()
    };
}

async function getComplaint(id) {
    const db = getDb();
    const doc = await db.collection('complaints').findOne({ _id: toObjectId(id) });
    if (!doc) throw new HttpError(404, 'Complaint not found.');
    return doc;
}

app.get('/api/zones', requireAuth, async (req, res) => {
    const db = getDb();
    const zones = await db.collection('zones').find().sort({ name: 1 }).toArray();
    res.json(zones.map(z => ({
        id: z._id.toString(),
        name: z.name,
        lat: z.lat,
        lng: z.lng
    })));
});

// All authenticated users can view complaints feed
app.get('/api/complaints', requireAuth, async (req, res) => {
    const db = getDb();
    const rows = await db.collection('complaints').aggregate([
        { $sort: { created_at: -1 } },
        {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'creator'
            }
        },
        { $unwind: { path: '$creator', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    res.json(rows.map(r => {
        const enriched = {
            ...r,
            creator_name: r.creator ? `${r.creator.first_name} ${r.creator.last_name}` : null,
            creator_role: r.creator ? r.creator.role : 'citizen'
        };
        return toTask(enriched);
    }));
});

// Create new complaint (stored in MongoDB)
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

    const db = getDb();
    const zone = await db.collection('zones').findOne({ name: String(b.area || '') });
    if (!zone) throw new HttpError(400, 'Please select a valid area.');

    const lat = parseFloat(b.lat);
    const lng = parseFloat(b.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
    const file = req.file;

    const complaintDoc = {
        user_id: req.user._id,
        zone_id: zone._id,
        zone_name: zone.name,
        description: text,
        reporter_name: name,
        reporter_aadhar: aadhar,
        reporter_age: age,
        reporter_gender: gender,
        reporter_residence: residence,
        status: 'reported',
        location_label: String(b.location || '').trim() || zone.name,
        latitude: hasCoords ? lat : zone.lat,
        longitude: hasCoords ? lng : zone.lng,
        has_image: !!file,
        image: file ? file.buffer : null,
        image_mime: file ? file.mimetype : null,
        image_name: file ? file.originalname : null,
        created_at: new Date(),
        updated_at: new Date()
    };

    const result = await db.collection('complaints').insertOne(complaintDoc);
    await db.collection('complaint_status_history').insertOne({
        complaint_id: result.insertedId,
        old_status: null,
        new_status: 'reported',
        changed_by: req.user._id,
        source: 'create',
        changed_at: new Date()
    });

    const created = await getComplaint(result.insertedId);
    res.status(201).json(toTask(created));
});

// Photo retrieval from MongoDB BSON storage
app.get('/api/complaints/:id/image', requireAuth, async (req, res) => {
    const doc = await getComplaint(req.params.id);
    if (!doc || !doc.image) throw new HttpError(404, 'Image not found.');
    res.set('Content-Type', doc.image_mime || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(doc.image.buffer || doc.image);
});

// RBAC Protected Status Updates: Only Officers and Admins can advance status on Kanban or List
app.patch('/api/complaints/:id/status', requireAuth, requireRole(ROLES.OFFICER, ROLES.ADMIN), async (req, res) => {
    const status = req.body?.status;
    const source = req.body?.source === 'kanban' ? 'kanban' : 'list';
    if (!STATUSES.includes(status)) throw new HttpError(400, 'Invalid status.');

    const db = getDb();
    const existing = await getComplaint(req.params.id);
    if (existing.status !== status) {
        await db.collection('complaints').updateOne(
            { _id: existing._id },
            { $set: { status, updated_at: new Date() } }
        );
        await db.collection('complaint_status_history').insertOne({
            complaint_id: existing._id,
            old_status: existing.status,
            new_status: status,
            changed_by: req.user._id,
            source,
            changed_at: new Date()
        });
    }

    res.json(toTask(await getComplaint(req.params.id)));
});

// Complaint Status Audit Trail
app.get('/api/complaints/:id/history', requireAuth, async (req, res) => {
    const db = getDb();
    const rows = await db.collection('complaint_status_history').aggregate([
        { $match: { complaint_id: toObjectId(req.params.id) } },
        { $sort: { changed_at: -1 } },
        {
            $lookup: {
                from: 'users',
                localField: 'changed_by',
                foreignField: '_id',
                as: 'changer'
            }
        },
        { $unwind: { path: '$changer', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    res.json(rows.map(h => ({
        old_status: h.old_status,
        new_status: h.new_status,
        source: h.source,
        changed_at: h.changed_at,
        changed_by: h.changer ? `${h.changer.first_name} ${h.changer.last_name}` : 'System',
        changer_role: h.changer ? h.changer.role : 'system'
    })));
});

// RBAC Protected Deletion
app.delete('/api/complaints/:id', requireAuth, async (req, res) => {
    const complaint = await getComplaint(req.params.id);
    const userRole = req.user.role || ROLES.CITIZEN;
    const isOwner = complaint.user_id && complaint.user_id.toString() === req.user._id.toString();

    if (userRole === ROLES.ADMIN) {
        // Universal delete permission
    } else if (userRole === ROLES.CITIZEN && isOwner) {
        // Citizen deleting their own complaint
    } else if (userRole === ROLES.CITIZEN && !isOwner) {
        throw new HttpError(403, 'Access Denied: Citizens are only permitted to delete their own reported complaints.');
    } else {
        throw new HttpError(403, 'Access Denied: Field Officers cannot delete complaints. Contact an Administrator.');
    }

    const db = getDb();
    await db.collection('complaints').deleteOne({ _id: complaint._id });
    await db.collection('complaint_status_history').deleteMany({ complaint_id: complaint._id });
    res.json({ message: 'Complaint removed.' });
});

// =======================================================
// ADMIN MANAGEMENT ROUTES (Protected by requireRole(ADMIN))
// =======================================================

// List all registered system users and their roles
app.get('/api/admin/users', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const db = getDb();
    const usersWithStats = await db.collection('users').aggregate([
        {
            $lookup: {
                from: 'complaints',
                localField: '_id',
                foreignField: 'user_id',
                as: 'userComplaints'
            }
        },
        {
            $project: {
                first_name: 1,
                last_name: 1,
                email: 1,
                mobile_number: 1,
                aadhar_number: 1,
                role: 1,
                address: 1,
                created_at: 1,
                complaintsCount: { $size: '$userComplaints' }
            }
        },
        { $sort: { _id: 1 } }
    ]).toArray();

    res.json(usersWithStats.map(r => ({
        id: r._id.toString(),
        name: `${r.first_name} ${r.last_name}`,
        email: r.email,
        mobile: r.mobile_number,
        aadhar: r.aadhar_number,
        role: r.role,
        roleMeta: ROLE_METADATA[r.role] || ROLE_METADATA[ROLES.CITIZEN],
        address: r.address,
        complaintsCount: Number(r.complaintsCount || 0),
        createdAt: r.created_at
    })));
});

// Update a user's role (Admin only)
app.patch('/api/admin/users/:id/role', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const newRole = req.body?.role;
    if (!ROLE_LIST.includes(newRole)) throw new HttpError(400, 'Invalid role.');

    const db = getDb();
    const result = await db.collection('users').updateOne(
        { _id: toObjectId(req.params.id) },
        { $set: { role: newRole, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) throw new HttpError(404, 'User not found.');

    res.json({ message: `Role updated to ${ROLE_METADATA[newRole].name}.` });
});

// Delete a user and their associated data (Admin only)
app.delete('/api/admin/users/:id', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const targetId = toObjectId(req.params.id);
    if (!targetId) throw new HttpError(400, 'Invalid user ID.');

    // Safety: Admin cannot delete themselves
    if (req.user._id.toString() === targetId.toString()) {
        throw new HttpError(400, 'Access Denied: You cannot delete your own Administrator account.');
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ _id: targetId });
    if (!user) throw new HttpError(404, 'User not found.');

    // Clean up user sessions, complaints, and user record
    await db.collection('sessions').deleteMany({ user_id: targetId });
    await db.collection('complaints').deleteMany({ user_id: targetId });
    await db.collection('users').deleteOne({ _id: targetId });

    res.json({ message: `User "${user.first_name} ${user.last_name}" (${user.email}) has been permanently deleted.` });
});

// System Audit Logs (Admin only)
app.get('/api/admin/audit', requireAuth, requireRole(ROLES.ADMIN), async (req, res) => {
    const db = getDb();
    const rows = await db.collection('complaint_status_history').aggregate([
        { $sort: { changed_at: -1 } },
        { $limit: 50 },
        {
            $lookup: {
                from: 'complaints',
                localField: 'complaint_id',
                foreignField: '_id',
                as: 'complaint'
            }
        },
        { $unwind: { path: '$complaint', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'users',
                localField: 'changed_by',
                foreignField: '_id',
                as: 'actor'
            }
        },
        { $unwind: { path: '$actor', preserveNullAndEmptyArrays: true } }
    ]).toArray();

    res.json(rows.map(h => ({
        id: h._id.toString(),
        complaint_id: h.complaint_id ? h.complaint_id.toString() : null,
        description: h.complaint ? h.complaint.description : 'Complaint deleted',
        old_status: h.old_status,
        new_status: h.new_status,
        source: h.source,
        changed_at: h.changed_at,
        actor_name: h.actor ? `${h.actor.first_name} ${h.actor.last_name}` : 'System',
        actor_email: h.actor ? h.actor.email : null,
        actor_role: h.actor ? h.actor.role : 'system'
    })));
});

// =======================================================
// PRACTICAL - 10: MONGODB CRUD REST API ROUTES
// =======================================================
const MONGO_COLLECTION = 'civic_complaints';

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
    delete updates._id;
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

// Central error handler
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller.' : err.message });
    }
    if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server.' });
});

// =======================================================
// START SERVER (POWERED BY MONGODB)
// =======================================================

initDatabase({ log: msg => console.log('[mongodb] ' + msg) })
    .then(() => {
        app.listen(PORT, () => console.log(`CivicGrid (MongoDB) running at http://localhost:${PORT}`));
    })
    .catch(err => {
        console.error(explainMongoError(err));
        process.exit(1);
    });
