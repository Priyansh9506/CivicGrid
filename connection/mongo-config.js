/*
 * Practical - 10: MongoDB Configuration Settings & Error Handling
 * Defines connection parameters for MongoDB (Default: mongodb://127.0.0.1:27017)
 * Reads optional overrides from .env file
 */

const path = require('path');

// Load .env if it exists
try {
    process.loadEnvFile(path.join(__dirname, '..', '.env'));
} catch (err) {
    if (err.code !== 'ENOENT' && typeof process.loadEnvFile === 'function') {
        // Ignore missing file, throw other errors
    }
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'civicgrid_mongo';

function explainMongoError(err) {
    if (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('ECONNREFUSED'))) {
        return `❌ Cannot reach MongoDB at ${MONGO_URI}.\n` +
               `👉 Make sure MongoDB service is running:\n` +
               `   - Windows Service: net start MongoDB (or via Windows Services app)\n` +
               `   - Standalone: mongod --dbpath <data_directory>\n` +
               `   - Docker: docker run -d -p 27017:27017 mongo\n`;
    }
    return `❌ MongoDB Error: ${err.message || err}`;
}

module.exports = {
    MONGO_URI,
    MONGO_DB_NAME,
    explainMongoError
};
