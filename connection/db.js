/*
 * Practical - 8: Shared MySQL connection pool
 * Wraps the callback-based `mysql2` package in a small Promise helper so the
 * server and the demo scripts can use async/await.
 */

const mysql = require('mysql2');
const config = require('./config');

let pool = null;

// Create the pool lazily, after setup.js has made sure the database exists
function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            connectionLimit: 10,
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            charset: 'utf8mb4'
        });
    }
    return pool;
}

// Run a query and resolve with its results
function query(sql, params = []) {
    return new Promise((resolve, reject) => {
        getPool().query(sql, params, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

// Run several queries inside one transaction; `work` receives a query function
function transaction(work) {
    return new Promise((resolve, reject) => {
        getPool().getConnection((err, conn) => {
            if (err) return reject(err);

            const q = (sql, params = []) => new Promise((res, rej) => {
                conn.query(sql, params, (e, r) => (e ? rej(e) : res(r)));
            });

            conn.beginTransaction(async (err) => {
                if (err) { conn.release(); return reject(err); }
                try {
                    const result = await work(q);
                    conn.commit((err) => {
                        if (err) return conn.rollback(() => { conn.release(); reject(err); });
                        conn.release();
                        resolve(result);
                    });
                } catch (e) {
                    conn.rollback(() => { conn.release(); reject(e); });
                }
            });
        });
    });
}

function closePool() {
    return new Promise((resolve) => {
        if (!pool) return resolve();
        pool.end(() => { pool = null; resolve(); });
    });
}

module.exports = { mysql, getPool, query, transaction, closePool };
