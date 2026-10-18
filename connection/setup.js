/*
 * Practical - 10: MongoDB Database Setup & Migration
 * Replaces MySQL setup with MongoDB collections, unique indexes, and seed data.
 *
 * Operations performed:
 *   1. Connects to MongoDB server (mongodb://127.0.0.1:27017)
 *   2. Creates collections: users, sessions, zones, complaints, complaint_status_history
 *   3. Enforces unique indexes: users.email, users.aadhar_number, sessions.token, zones.name
 *   4. Seeds pre-configured RBAC users (Citizen, Officer, Admin)
 *   5. Seeds geographic zones lookup data
 *   6. Seeds initial sample complaints with audit status history
 *   7. Standalone test: Demonstrates Create, Read, and Update operations on MongoDB
 *
 * Run directly: npm run setup (or: node connection/setup.js)
 */

const { connectMongo, closeMongo, getDb, ObjectId } = require('./mongo-db');
const { explainMongoError } = require('./mongo-config');
const { DEMO_USERS, hashPassword, ROLES } = require('./rbac');

const ZONES_DATA = [
    { name: 'North Zone', lat: 23.0784, lng: 72.5998 },
    { name: 'South Zone', lat: 22.9904, lng: 72.5936 },
    { name: 'East Zone',  lat: 23.0334, lng: 72.6324 },
    { name: 'West Zone',  lat: 23.0366, lng: 72.5456 },
    { name: 'Downtown',   lat: 23.0257, lng: 72.5786 }
];

const SAMPLE_COMPLAINTS = [
    { description: 'Repair main water pipe leak',    zone: 'Downtown',   status: 'reported' },
    { description: 'Fix streetlights on 5th Avenue', zone: 'North Zone', status: 'inprogress' },
    { description: 'Clear garbage dump near park',   zone: 'South Zone', status: 'resolved' },
    { description: 'Fill potholes on Highway 9',     zone: 'East Zone',  status: 'reported' }
];

/**
 * Initializes MongoDB collections, indexes, and initial seeds.
 */
async function initDatabase({ log = () => {} } = {}) {
    const db = await connectMongo();
    log(`Connected to MongoDB database: '${db.databaseName}'`);

    // 1. Setup collections & unique indexes
    const usersCol = db.collection('users');
    const sessionsCol = db.collection('sessions');
    const zonesCol = db.collection('zones');
    const complaintsCol = db.collection('complaints');
    const historyCol = db.collection('complaint_status_history');

    // Create unique indexes
    await usersCol.createIndex({ email: 1 }, { unique: true });
    await usersCol.createIndex({ aadhar_number: 1 }, { unique: true, sparse: true });
    await sessionsCol.createIndex({ token: 1 }, { unique: true });
    await sessionsCol.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }); // MongoDB TTL index
    await zonesCol.createIndex({ name: 1 }, { unique: true });
    await complaintsCol.createIndex({ status: 1 });
    await complaintsCol.createIndex({ created_at: -1 });
    await historyCol.createIndex({ complaint_id: 1 });
    log('Created MongoDB indexes (email, aadhar, token, zones, status, TTL)');

    // 2. Seed RBAC Users (Citizen, Officer, Admin)
    for (const demo of DEMO_USERS) {
        const existing = await usersCol.findOne({ email: demo.emailId });
        if (!existing) {
            await usersCol.insertOne({
                first_name: demo.firstName,
                last_name: demo.lastName,
                mobile_number: demo.mobileNumber,
                aadhar_number: demo.aadharNumber,
                email: demo.emailId,
                password_hash: hashPassword(demo.password),
                role: demo.role,
                address: demo.address,
                created_at: new Date(),
                updated_at: new Date()
            });
            log(`Created demo RBAC user: ${demo.emailId} (${demo.role})`);
        } else {
            await usersCol.updateOne(
                { email: demo.emailId },
                { $set: { role: demo.role, updated_at: new Date() } }
            );
        }
    }

    // 3. Seed Zones
    for (const zone of ZONES_DATA) {
        await zonesCol.updateOne(
            { name: zone.name },
            { $setOnInsert: { name: zone.name, lat: zone.lat, lng: zone.lng } },
            { upsert: true }
        );
    }
    log(`Seeded ${ZONES_DATA.length} geographic zones`);

    // 4. Seed sample complaints if empty
    const complaintsCount = await complaintsCol.countDocuments();
    if (complaintsCount === 0) {
        const adminUser = await usersCol.findOne({ role: ROLES.ADMIN });
        const adminId = adminUser ? adminUser._id : null;

        for (const sample of SAMPLE_COMPLAINTS) {
            const zoneDoc = await zonesCol.findOne({ name: sample.zone });
            const complaintDoc = {
                user_id: adminId,
                zone_name: sample.zone,
                zone_id: zoneDoc ? zoneDoc._id : null,
                description: sample.description,
                reporter_name: 'CivicGrid Admin',
                reporter_aadhar: '000000000000',
                reporter_age: 30,
                reporter_gender: 'Other',
                reporter_residence: 'Municipal Headquarters',
                status: sample.status,
                location_label: sample.zone,
                latitude: zoneDoc ? zoneDoc.lat : 23.0257,
                longitude: zoneDoc ? zoneDoc.lng : 72.5786,
                has_image: false,
                image: null,
                image_mime: null,
                image_name: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            const inserted = await complaintsCol.insertOne(complaintDoc);
            await historyCol.insertOne({
                complaint_id: inserted.insertedId,
                old_status: null,
                new_status: sample.status,
                changed_by: adminId,
                source: 'seed',
                changed_at: new Date()
            });
        }
        log(`Seeded ${SAMPLE_COMPLAINTS.length} initial complaints with status audit records`);
    }

    return db;
}

/**
 * Closes the MongoDB connection.
 */
async function closeConnection(db, log = () => {}) {
    await closeMongo();
    log('MongoDB connection closed');
}

/**
 * Standalone demo runner for Practical setup verification.
 */
async function main() {
    console.log('========================================================================');
    console.log('   PRACTICAL - 10: MONGODB DATABASE SETUP & INITIALIZATION');
    console.log('========================================================================\n');

    const log = (...args) => console.log(...args);
    let db;
    try {
        db = await initDatabase({ log });

        // Demonstrate a sample Insert and Update operation on MongoDB
        console.log('\n--- VERIFYING SETUP WITH SAMPLE INSERT & UPDATE ON MONGODB ---');
        const complaintsCol = db.collection('complaints');
        const historyCol = db.collection('complaint_status_history');
        const zonesCol = db.collection('zones');

        const westZone = await zonesCol.findOne({ name: 'West Zone' });

        // INSERT A RECORD
        const testDoc = {
            description: 'Broken footpath tiles (Practical 10 MongoDB Setup Demo)',
            reporter_name: 'John Doe',
            reporter_aadhar: '123412341234',
            reporter_age: 28,
            reporter_gender: 'Male',
            reporter_residence: 'Satellite, Ahmedabad',
            zone_name: 'West Zone',
            location_label: 'West Zone',
            latitude: westZone ? westZone.lat : 23.0366,
            longitude: westZone ? westZone.lng : 72.5456,
            status: 'reported',
            has_image: false,
            created_at: new Date(),
            updated_at: new Date()
        };

        const inserted = await complaintsCol.insertOne(testDoc);
        console.log('✅ Document inserted with _id:', inserted.insertedId.toString());

        await historyCol.insertOne({
            complaint_id: inserted.insertedId,
            old_status: null,
            new_status: 'reported',
            source: 'create',
            changed_at: new Date()
        });

        // UPDATE THE RECORD
        const updated = await complaintsCol.updateOne(
            { _id: inserted.insertedId },
            {
                $set: {
                    reporter_name: 'Devendra Vashi',
                    status: 'inprogress',
                    updated_at: new Date()
                }
            }
        );
        console.log('✅ Document updated (matched:', updated.matchedCount, ', modified:', updated.modifiedCount, ')');

        await historyCol.insertOne({
            complaint_id: inserted.insertedId,
            old_status: 'reported',
            new_status: 'inprogress',
            source: 'list',
            changed_at: new Date()
        });

        // FETCH AND DISPLAY
        const doc = await complaintsCol.findOne({ _id: inserted.insertedId });
        console.table([{
            ID: doc._id.toString().slice(-8),
            Description: doc.description,
            Reporter: doc.reporter_name,
            Status: doc.status,
            Zone: doc.zone_name
        }]);

        console.log('\n========================================================================');
        console.log('   MONGODB SETUP & INITIALIZATION COMPLETED SUCCESSFULLY');
        console.log('========================================================================\n');
    } catch (err) {
        console.error('Setup failed: ' + explainMongoError(err));
        process.exitCode = 1;
    } finally {
        await closeConnection(db, log);
    }
}

if (require.main === module) main();

module.exports = { initDatabase, closeConnection, ZONES_DATA, SAMPLE_COMPLAINTS };
