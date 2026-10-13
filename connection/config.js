/*
 * Practical - 8: MySQL connection settings
 * Change these to match your MySQL server (XAMPP default: root with empty password).
 * Any value can also be overridden in the .env file at the project root (see .env.example).
 */

const path = require('path');

// Load .env if it exists (process.loadEnvFile is built into Node 20.12+ / 21.7+)
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
    if (err.code !== 'ENOENT' && typeof process.loadEnvFile === 'function') throw err;
}

// Turn common connection errors into a hint about what to fix
function explainDbError(err) {
    switch (err.code) {
        case 'ECONNREFUSED':
            return `Cannot reach MySQL at ${module.exports.host}:${module.exports.port}. ` +
                   'Start the MySQL server (Windows service "MySQL80" or the XAMPP control panel) and try again.';
        case 'ER_ACCESS_DENIED_ERROR':
            return `MySQL on port ${module.exports.port} rejected user '${module.exports.user}' ` +
                   `(${module.exports.password ? 'with' : 'without'} a password). ` +
                   'Check DB_PORT and DB_PASSWORD in .env: XAMPP\'s MySQL uses an empty password, ' +
                   'a separately installed MySQL 8 uses the password chosen during its install.';
        default:
            return err.stack || String(err);
    }
}

module.exports = {
    host: process.env.DB_HOST || 'localhost',   // Change to your MySQL host
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',        // Change to your MySQL username
    password: process.env.DB_PASSWORD || '',    // Change to your MySQL password
    database: process.env.DB_NAME || 'civicgrid', // Change to your MySQL database name
    explainDbError
};
