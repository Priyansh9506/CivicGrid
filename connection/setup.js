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

        // Seed the zones lookup table (INSERT IGNORE skips rows that already exist)
        await run(connection, 'INSERT IGNORE INTO zones (name, lat, lng) VALUES ?', [ZONES]);

        // Seed sample complaints only into an empty table
        const [{ total }] = await run(connection, 'SELECT COUNT(*) AS total FROM complaints');
        if (total === 0) {
            for (const [description, zone, status] of SAMPLE_COMPLAINTS) {
                const result = await run(connection,
                    `INSERT INTO complaints
                        (zone_id, description, reporter_name, reporter_aadhar, reporter_age,
                         reporter_gender, reporter_residence, status, location_label, latitude, longitude)
                     SELECT id, ?, 'CivicGrid Admin', '000000000000', 30, 'Other', 'Municipal Office', ?, name, lat, lng
                     FROM zones WHERE name = ?`,
                    [description, status, zone]);
                await run(connection,
                    `INSERT INTO complaint_status_history (complaint_id, old_status, new_status, source)
                     VALUES (?, NULL, ?, 'seed')`,
                    [result.insertId, status]);
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
