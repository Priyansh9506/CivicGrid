/*
 * Practical - 8 (I): Demonstrate Node.js using MySQL to perform the below operations:
 *                    Create a database, create a table, insert a record, and update the record.
 *
 * Run directly:   npm run setup   (or: node connection/setup.js)
 * Also used by server.js on startup so the app always has its tables.
 */

// Import required modules
const mysql = require('mysql2');
const config = require('./config');
const { TABLES, ZONES, SAMPLE_COMPLAINTS } = require('./schema');
const { DEMO_USERS, hashPassword } = require('./rbac');

// Images are stored in MySQL, so allow packets up to 16 MB (XAMPP ships with 1 MB)
const MAX_PACKET_BYTES = 16 * 1024 * 1024;

function run(connection, sql, params = []) {
    return new Promise((resolve, reject) => {
        connection.query(sql, params, (err, results) => (err ? reject(err) : resolve(results)));
    });
}

async function initDatabase({ log = () => {} } = {}) {
    // Create a connection to the MySQL server (no database yet — we create it below)
    const connection = mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        charset: 'utf8mb4'
    });

    // Connect to MySQL server
    await new Promise((resolve, reject) => {
        connection.connect((err) => {
            if (err) return reject(err);
            log('Connected to MySQL server as ID ' + connection.threadId);
            resolve();
        });
    });

    try {
        try {
            await run(connection, 'SET GLOBAL max_allowed_packet = ?', [MAX_PACKET_BYTES]);
        } catch (err) {
            log('Could not raise max_allowed_packet (' + err.code + '); images over 1 MB may fail.');
        }

        // Create a database
        await run(connection, `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(config.database)}
                               CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        log(`Database '${config.database}' created or already exists`);
        await run(connection, `USE ${mysql.escapeId(config.database)}`);

        // Create the tables
        for (const table of TABLES) {
            await run(connection, table.sql);
            log(`Table '${table.name}' created or already exists`);
        }

        // Ensure `role` column exists in `users` (migration for existing Practical 8 databases)
        const cols = await run(connection, `SHOW COLUMNS FROM users LIKE 'role'`);
        if (!cols.length) {
            await run(connection, `ALTER TABLE users ADD COLUMN role ENUM('citizen', 'officer', 'admin') NOT NULL DEFAULT 'citizen' AFTER password_hash`);
            log("Migrated 'users' table: added 'role' column");
        }

        // Seed demo RBAC users (Citizen, Officer, Admin)
        for (const demo of DEMO_USERS) {
            const existing = await run(connection, 'SELECT id FROM users WHERE email = ?', [demo.emailId]);
            if (!existing.length) {
                await run(connection,
                    `INSERT INTO users (first_name, last_name, mobile_number, aadhar_number, email, password_hash, role, address)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [demo.firstName, demo.lastName, demo.mobileNumber, demo.aadharNumber,
                     demo.emailId, hashPassword(demo.password), demo.role, demo.address]);
                log(`Created demo RBAC user: ${demo.emailId} (${demo.role})`);
            } else {
                await run(connection, 'UPDATE users SET role = ? WHERE email = ?', [demo.role, demo.emailId]);
            }
        }

        // Seed the zones lookup table (INSERT IGNORE skips rows that already exist)
        await run(connection, 'INSERT IGNORE INTO zones (name, lat, lng) VALUES ?', [ZONES]);

        // Seed sample complaints only into an empty table
        const [{ total }] = await run(connection, 'SELECT COUNT(*) AS total FROM complaints');
        if (total === 0) {
            const adminUser = await run(connection, 'SELECT id FROM users WHERE email = ?', ['admin@civicgrid.org']);
            const adminId = adminUser.length ? adminUser[0].id : null;

            for (const [description, zone, status] of SAMPLE_COMPLAINTS) {
                const result = await run(connection,
                    `INSERT INTO complaints
                        (user_id, zone_id, description, reporter_name, reporter_aadhar, reporter_age,
                         reporter_gender, reporter_residence, status, location_label, latitude, longitude)
                     SELECT ?, id, ?, 'CivicGrid Admin', '000000000000', 30, 'Other', 'Municipal Office', ?, name, lat, lng
                     FROM zones WHERE name = ?`,
                    [adminId, description, status, zone]);
                await run(connection,
                    `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, changed_by, source)
                     VALUES (?, NULL, ?, ?, 'seed')`,
                    [result.insertId, status, adminId]);
            }
            log(`Inserted ${SAMPLE_COMPLAINTS.length} sample complaints`);
        }

        return connection;
    } catch (err) {
        connection.end();
        throw err;
    }
}

// Close the connection
function closeConnection(connection, log) {
    return new Promise((resolve) => {
        connection.end((err) => {
            if (err) log('Error closing connection: ' + err.stack);
            else log('Connection closed');
            resolve();
        });
    });
}

// Standalone demo: create database + tables, then insert a record and update it
async function main() {
    const log = (...args) => console.log(...args);
    let connection;
    try {
        connection = await initDatabase({ log });

        // Insert a record
        const inserted = await run(connection,
            `INSERT INTO complaints
                (zone_id, description, reporter_name, reporter_aadhar, reporter_age,
                 reporter_gender, reporter_residence, location_label, latitude, longitude)
             SELECT id, ?, ?, ?, ?, ?, ?, name, lat, lng FROM zones WHERE name = ?`,
            ['Broken footpath tiles (Practical 8 demo)', 'John Doe',
             '123412341234', 28, 'Male', 'Satellite, Ahmedabad', 'West Zone']);
        await run(connection,
            `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, source)
             VALUES (?, NULL, 'reported', 'create')`, [inserted.insertId]);
        console.log('Record inserted:', inserted);

        // Update a record
        const updated = await run(connection,
            'UPDATE complaints SET reporter_name = ?, status = ? WHERE id = ?',
            ['Devendra Vashi', 'inprogress', inserted.insertId]);
        await run(connection,
            `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, source)
             VALUES (?, 'reported', 'inprogress', 'list')`, [inserted.insertId]);
        console.log('Record updated:', updated);

        const rows = await run(connection,
            'SELECT id, description, reporter_name, status FROM complaints WHERE id = ?', [inserted.insertId]);
        console.table(rows);
    } catch (err) {
        console.error('Setup failed: ' + config.explainDbError(err));
        process.exitCode = 1;
    } finally {
        if (connection) await closeConnection(connection, log);
    }
}

if (require.main === module) main();

module.exports = { initDatabase, closeConnection };
