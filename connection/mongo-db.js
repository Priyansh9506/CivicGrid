/*
 * Practical - 10: MongoDB Connection Manager
 * Manages connection pooling, ping verification, and collection retrieval using MongoClient.
 */

const { MongoClient, ObjectId } = require('mongodb');
const { MONGO_URI, MONGO_DB_NAME, explainMongoError } = require('./mongo-config');

let client = null;
let database = null;

/**
 * Connect to MongoDB and return the database instance.
 */
async function connectMongo(customDbName) {
    if (database && client) {
        return database;
    }

    try {
        client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000
        });

        await client.connect();
        const targetDb = customDbName || MONGO_DB_NAME;
        database = client.db(targetDb);
        return database;
    } catch (err) {
        console.error(explainMongoError(err));
        throw err;
    }
}

/**
 * Ping the MongoDB server to verify connectivity.
 */
async function pingMongo() {
    const db = await connectMongo();
    const result = await db.command({ ping: 1 });
    return result;
}

/**
 * Get active database instance.
 */
function getDb() {
    if (!database) {
        throw new Error('Database not connected. Call connectMongo() first.');
    }
    return database;
}

/**
 * Get a specific collection from the connected database.
 */
function getCollection(collectionName) {
    return getDb().collection(collectionName);
}

/**
 * Close MongoDB client connection.
 */
async function closeMongo() {
    if (client) {
        await client.close();
        client = null;
        database = null;
    }
}

module.exports = {
    connectMongo,
    pingMongo,
    getDb,
    getCollection,
    closeMongo,
    ObjectId,
    MONGO_URI,
    MONGO_DB_NAME
};
