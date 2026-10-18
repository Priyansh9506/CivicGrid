/*
 * Practical - 10: User-Defined CRUD Functions for MongoDB
 *
 * Implements:
 *   - CREATE: createOne, createMany
 *   - READ:   readAll, readOne, readById, readDistinct
 *   - UPDATE: updateOneRecord, updateManyRecords, updateById
 *   - DELETE: deleteOneRecord, deleteManyRecords, deleteById
 *   - ADVANCED: aggregateRecords
 */

const { getCollection, ObjectId } = require('./mongo-db');

/**
 * Normalizes input ID into an ObjectId if valid string.
 */
function toObjectId(id) {
    if (id instanceof ObjectId) return id;
    if (typeof id === 'string' && ObjectId.isValid(id)) {
        return new ObjectId(id);
    }
    return id;
}

// ==========================================
// 1. CREATE OPERATIONS
// ==========================================

/**
 * Inserts a single document into the specified collection.
 * @param {string} collectionName - Target collection.
 * @param {Object} document - Document data.
 * @returns {Promise<Object>} Result with insertedId and success status.
 */
async function createOne(collectionName, document) {
    const col = getCollection(collectionName);
    const docWithMeta = {
        ...document,
        createdAt: document.createdAt || new Date()
    };
    const result = await col.insertOne(docWithMeta);
    return {
        acknowledged: result.acknowledged,
        insertedId: result.insertedId,
        document: { _id: result.insertedId, ...docWithMeta }
    };
}

/**
 * Inserts multiple documents into the specified collection.
 * @param {string} collectionName - Target collection.
 * @param {Array<Object>} documents - Array of document objects.
 * @returns {Promise<Object>} Result with insertedCount and insertedIds.
 */
async function createMany(collectionName, documents) {
    if (!Array.isArray(documents) || documents.length === 0) {
        throw new Error('createMany requires a non-empty array of documents.');
    }
    const col = getCollection(collectionName);
    const now = new Date();
    const docsWithMeta = documents.map(doc => ({
        ...doc,
        createdAt: doc.createdAt || now
    }));
    const result = await col.insertMany(docsWithMeta);
    return {
        acknowledged: result.acknowledged,
        insertedCount: result.insertedCount,
        insertedIds: result.insertedIds
    };
}

// ==========================================
// 2. READ OPERATIONS
// ==========================================

/**
 * Retrieves all documents matching the filter.
 * @param {string} collectionName - Target collection.
 * @param {Object} [options] - Query options { filter, projection, sort, limit, skip }.
 * @returns {Promise<Array>} Array of found documents.
 */
async function readAll(collectionName, { filter = {}, projection, sort, limit = 0, skip = 0 } = {}) {
    const col = getCollection(collectionName);
    let cursor = col.find(filter);

    if (projection) cursor = cursor.project(projection);
    if (sort) cursor = cursor.sort(sort);
    if (skip > 0) cursor = cursor.skip(skip);
    if (limit > 0) cursor = cursor.limit(limit);

    return cursor.toArray();
}

/**
 * Retrieves a single document matching the filter.
 * @param {string} collectionName - Target collection.
 * @param {Object} filter - Query filter.
 * @param {Object} [options] - Query options { projection }.
 * @returns {Promise<Object|null>} Found document or null.
 */
async function readOne(collectionName, filter = {}, { projection } = {}) {
    const col = getCollection(collectionName);
    const options = projection ? { projection } : {};
    return col.findOne(filter, options);
}

/**
 * Retrieves a single document by its _id.
 * @param {string} collectionName - Target collection.
 * @param {string|ObjectId} id - Document _id.
 * @param {Object} [options] - Query options { projection }.
 * @returns {Promise<Object|null>} Found document or null.
 */
async function readById(collectionName, id, options = {}) {
    return readOne(collectionName, { _id: toObjectId(id) }, options);
}

/**
 * Retrieves unique/distinct values for a given field.
 * @param {string} collectionName - Target collection.
 * @param {string} field - Field name.
 * @param {Object} [filter] - Optional filter query.
 * @returns {Promise<Array>} Array of distinct values.
 */
async function readDistinct(collectionName, field, filter = {}) {
    const col = getCollection(collectionName);
    return col.distinct(field, filter);
}

// ==========================================
// 3. UPDATE OPERATIONS
// ==========================================

/**
 * Updates a single document matching the filter.
 * Automatically wraps updates in $set if not specified with an update operator.
 * @param {string} collectionName - Target collection.
 * @param {Object} filter - Query filter to locate document.
 * @param {Object} updateData - Data fields to update or update operators.
 * @param {Object} [options] - Options like { upsert: false }.
 * @returns {Promise<Object>} Result with matchedCount, modifiedCount, upsertedId.
 */
async function updateOneRecord(collectionName, filter, updateData, options = {}) {
    const col = getCollection(collectionName);
    // If updateData doesn't contain operator like $set, wrap it in $set
    const hasOperators = Object.keys(updateData).some(k => k.startsWith('$'));
    const updateDoc = hasOperators
        ? updateData
        : {
            $set: {
                ...updateData,
                updatedAt: new Date()
            }
        };

    const result = await col.updateOne(filter, updateDoc, options);
    return {
        acknowledged: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId
    };
}

/**
 * Updates a single document by its _id.
 * @param {string} collectionName - Target collection.
 * @param {string|ObjectId} id - Document _id.
 * @param {Object} updateData - Data fields to update.
 * @returns {Promise<Object>} Update result.
 */
async function updateById(collectionName, id, updateData) {
    return updateOneRecord(collectionName, { _id: toObjectId(id) }, updateData);
}

/**
 * Updates multiple documents matching the filter.
 * @param {string} collectionName - Target collection.
 * @param {Object} filter - Query filter.
 * @param {Object} updateData - Fields to update.
 * @returns {Promise<Object>} Result with matchedCount and modifiedCount.
 */
async function updateManyRecords(collectionName, filter, updateData) {
    const col = getCollection(collectionName);
    const hasOperators = Object.keys(updateData).some(k => k.startsWith('$'));
    const updateDoc = hasOperators
        ? updateData
        : {
            $set: {
                ...updateData,
                updatedAt: new Date()
            }
        };

    const result = await col.updateMany(filter, updateDoc);
    return {
        acknowledged: result.acknowledged,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
    };
}

// ==========================================
// 4. DELETE OPERATIONS
// ==========================================

/**
 * Deletes a single document matching the filter.
 * @param {string} collectionName - Target collection.
 * @param {Object} filter - Query filter.
 * @returns {Promise<Object>} Result with acknowledged and deletedCount.
 */
async function deleteOneRecord(collectionName, filter) {
    const col = getCollection(collectionName);
    const result = await col.deleteOne(filter);
    return {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
    };
}

/**
 * Deletes a single document by its _id.
 * @param {string} collectionName - Target collection.
 * @param {string|ObjectId} id - Document _id.
 * @returns {Promise<Object>} Result with acknowledged and deletedCount.
 */
async function deleteById(collectionName, id) {
    return deleteOneRecord(collectionName, { _id: toObjectId(id) });
}

/**
 * Deletes multiple documents matching the filter.
 * @param {string} collectionName - Target collection.
 * @param {Object} filter - Query filter.
 * @returns {Promise<Object>} Result with acknowledged and deletedCount.
 */
async function deleteManyRecords(collectionName, filter) {
    const col = getCollection(collectionName);
    const result = await col.deleteMany(filter);
    return {
        acknowledged: result.acknowledged,
        deletedCount: result.deletedCount
    };
}

// ==========================================
// 5. ADVANCED / AGGREGATION
// ==========================================

/**
 * Performs an aggregation pipeline on the collection.
 * @param {string} collectionName - Target collection.
 * @param {Array<Object>} pipeline - Aggregation stages.
 * @returns {Promise<Array>} Aggregation results.
 */
async function aggregateRecords(collectionName, pipeline) {
    const col = getCollection(collectionName);
    return col.aggregate(pipeline).toArray();
}

module.exports = {
    createOne,
    createMany,
    readAll,
    readOne,
    readById,
    readDistinct,
    updateOneRecord,
    updateById,
    updateManyRecords,
    deleteOneRecord,
    deleteById,
    deleteManyRecords,
    aggregateRecords,
    toObjectId
};
