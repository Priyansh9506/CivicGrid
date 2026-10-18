/*
 * Practical - 10: Demonstrate Node.js using MongoDB to perform CRUD Operations
 *
 * Demonstrates:
 *   1. MongoDB Connection & Ping Verification using official MongoDB driver
 *   2. CREATE: insertOne (single document) & insertMany (batch documents)
 *   3. READ: find (all), findOne (filtered), projection, distinct
 *   4. UPDATE: updateOne (status advance) & updateMany (bulk field modifier)
 *   5. AGGREGATE: Grouping by area & status
 *   6. DELETE: deleteOne (by ID) & deleteMany (filtered removal)
 *
 * Run:  npm run mongo-demo   (or: node connection/mongo-crud-demo.js)
 */

const { connectMongo, pingMongo, closeMongo, getDb, MONGO_URI, MONGO_DB_NAME } = require('./mongo-db');
const {
    createOne,
    createMany,
    readAll,
    readOne,
    readById,
    readDistinct,
    updateOneRecord,
    updateManyRecords,
    deleteOneRecord,
    deleteManyRecords,
    aggregateRecords
} = require('./mongo-crud');
const { explainMongoError } = require('./mongo-config');

const COLLECTION = 'civic_complaints';

async function main() {
    console.log('========================================================================');
    console.log('   PRACTICAL - 10: NODE.JS WITH MONGODB CRUD DEMONSTRATION');
    console.log('========================================================================\n');

    // ---------------------------------------------------------
    // 1. CONNECTION & PING
    // ---------------------------------------------------------
    console.log('--- 1. CONNECTING TO MONGODB ---');
    console.log(`Connecting to URI: ${MONGO_URI}`);
    console.log(`Target Database:   ${MONGO_DB_NAME}`);
    
    await connectMongo();
    await pingMongo();
    console.log('✅ Connected and successfully pinged MongoDB server!\n');

    const db = getDb();
    // Reset collection for a clean and reproducible demo
    await db.collection(COLLECTION).deleteMany({});

    // ---------------------------------------------------------
    // 2. CREATE (C) OPERATIONS
    // ---------------------------------------------------------
    console.log('--- 2. CREATE (INSERT) OPERATIONS ---');

    // 2.1 createOne: Single document insertion
    console.log('2.1: createOne() — Inserting a single civic complaint:');
    const singleComplaint = {
        description: 'Deep pothole causing traffic jam near SG Highway crossroad',
        area: 'Satellite',
        priority: 'High',
        status: 'reported',
        reporter: {
            name: 'Aarav Mehta',
            mobile: '9876543210',
            aadhar: '111122223333'
        },
        location: {
            label: 'Opp. ISKCON Temple, SG Highway',
            coords: { lat: 23.0298, lng: 72.5074 }
        },
        tags: ['roads', 'safety', 'monsoon']
    };

    const singleRes = await createOne(COLLECTION, singleComplaint);
    console.log(`✅ Single complaint inserted with _id: ${singleRes.insertedId}\n`);

    // 2.2 createMany: Batch document insertion
    console.log('2.2: createMany() — Inserting batch of 4 complaints across zones:');
    const batchComplaints = [
        {
            description: 'Streetlight bulb flickering and malfunctioning at street 4',
            area: 'Navrangpura',
            priority: 'Medium',
            status: 'reported',
            reporter: { name: 'Priya Shah', mobile: '9876543220', aadhar: '222233334444' },
            location: { label: 'Near University Ground', coords: { lat: 23.0373, lng: 72.5525 } },
            tags: ['electrical', 'lighting']
        },
        {
            description: 'Garbage dump overflow near market area attracting stray animals',
            area: 'Paldi',
            priority: 'High',
            status: 'reported',
            reporter: { name: 'Ramesh Patel', mobile: '9876543230', aadhar: '333344445555' },
            location: { label: 'Bhatta vegetable market', coords: { lat: 23.0125, lng: 72.5629 } },
            tags: ['sanitation', 'health']
        },
        {
            description: 'Broken water supply pipeline causing water loss on main street',
            area: 'Paldi',
            priority: 'Low',
            status: 'inprogress',
            reporter: { name: 'Sneha Joshi', mobile: '9876543240', aadhar: '444455556666' },
            location: { label: 'Mahalaxmi cross road', coords: { lat: 23.0135, lng: 72.5645 } },
            tags: ['water', 'leakage']
        },
        {
            description: 'Fallen tree branch obstructing pedestrian footpath',
            area: 'Downtown',
            priority: 'Medium',
            status: 'resolved',
            reporter: { name: 'Vikram Desai', mobile: '9876543250', aadhar: '555566667777' },
            location: { label: 'Relief Road', coords: { lat: 23.0276, lng: 72.5871 } },
            tags: ['parks', 'obstruction']
        }
    ];

    const batchRes = await createMany(COLLECTION, batchComplaints);
    console.log(`✅ Inserted ${batchRes.insertedCount} documents successfully.`);
    console.log(`   Generated ObjectIds:`, Object.values(batchRes.insertedIds).map(id => id.toString()));

    // ---------------------------------------------------------
    // 3. READ (R) OPERATIONS
    // ---------------------------------------------------------
    console.log('\n--- 3. READ (QUERY) OPERATIONS ---');

    // 3.1 readAll: Read all documents
    console.log('3.1: readAll() — Fetching all complaints in collection:');
    const allComplaints = await readAll(COLLECTION);
    console.table(allComplaints.map(c => ({
        ID: c._id.toString().slice(-8),
        Description: c.description.slice(0, 38) + '...',
        Area: c.area,
        Priority: c.priority,
        Status: c.status,
        Reporter: c.reporter?.name
    })));

    // 3.2 readOne: Filter by area
    console.log('\n3.2: readOne({ area: "Satellite" }) — Querying specific document:');
    const satelliteDoc = await readOne(COLLECTION, { area: 'Satellite' });
    console.log({
        _id: satelliteDoc._id,
        description: satelliteDoc.description,
        area: satelliteDoc.area,
        reporter: satelliteDoc.reporter,
        location: satelliteDoc.location.label,
        status: satelliteDoc.status
    });

    // 3.3 Filter with conditional criteria (status: 'reported' AND priority: 'High')
    console.log('\n3.3: Conditional Filter — status: "reported" AND priority: "High":');
    const highPriorityReported = await readAll(COLLECTION, {
        filter: { status: 'reported', priority: 'High' }
    });
    console.table(highPriorityReported.map(c => ({
        ID: c._id.toString().slice(-8),
        Description: c.description.slice(0, 35) + '...',
        Area: c.area,
        Priority: c.priority,
        Status: c.status
    })));

    // 3.4 Projection: Select only specific fields
    console.log('\n3.4: Projection — Fetching only { description: 1, area: 1, status: 1, _id: 0 }:');
    const projected = await readAll(COLLECTION, {
        projection: { description: 1, area: 1, status: 1, _id: 0 },
        limit: 3
    });
    console.log(projected);

    // 3.5 readDistinct: Unique values for field
    console.log('\n3.5: readDistinct() — Unique areas and statuses:');
    const distinctAreas = await readDistinct(COLLECTION, 'area');
    const distinctStatuses = await readDistinct(COLLECTION, 'status');
    console.log(`Distinct Areas:    ${JSON.stringify(distinctAreas)}`);
    console.log(`Distinct Statuses: ${JSON.stringify(distinctStatuses)}`);

    // ---------------------------------------------------------
    // 4. UPDATE (U) OPERATIONS
    // ---------------------------------------------------------
    console.log('\n--- 4. UPDATE (MODIFY) OPERATIONS ---');

    // 4.1 updateOneRecord: Update single complaint status and assign officer
    console.log(`4.1: updateOneRecord() — Advancing complaint ${_idShort(singleRes.insertedId)} to "inprogress":`);
    const updateResult = await updateOneRecord(
        COLLECTION,
        { _id: singleRes.insertedId },
        {
            status: 'inprogress',
            assignedOfficer: 'Officer Patel (Ward 7)',
            officerRemarks: 'Excavation team dispatched to fill pothole on SG Highway'
        }
    );
    console.log(`Matched: ${updateResult.matchedCount}, Modified: ${updateResult.modifiedCount}`);

    // Verify update
    const updatedSingle = await readById(COLLECTION, singleRes.insertedId);
    console.log('Updated Document verification:');
    console.log({
        _id: updatedSingle._id,
        status: updatedSingle.status,
        assignedOfficer: updatedSingle.assignedOfficer,
        officerRemarks: updatedSingle.officerRemarks,
        updatedAt: updatedSingle.updatedAt
    });

    // 4.2 updateManyRecords: Bulk update multiple complaints
    console.log('\n4.2: updateManyRecords() — Upgrading all "Paldi" complaints to priority: "Urgent":');
    const bulkUpdateRes = await updateManyRecords(
        COLLECTION,
        { area: 'Paldi' },
        { priority: 'Urgent', escalatedBy: 'Zonal Commissioner' }
    );
    console.log(`Matched: ${bulkUpdateRes.matchedCount}, Modified: ${bulkUpdateRes.modifiedCount}`);

    const paldiComplaints = await readAll(COLLECTION, { filter: { area: 'Paldi' } });
    console.table(paldiComplaints.map(c => ({
        ID: c._id.toString().slice(-8),
        Area: c.area,
        Priority: c.priority,
        EscalatedBy: c.escalatedBy,
        Status: c.status
    })));

    // ---------------------------------------------------------
    // 5. AGGREGATION PIPELINE (Bonus Viva Showcase)
    // ---------------------------------------------------------
    console.log('\n--- 5. AGGREGATION PIPELINE (GROUP & COUNT) ---');
    console.log('Aggregating complaints grouped by Area:');
    const areaStats = await aggregateRecords(COLLECTION, [
        {
            $group: {
                _id: '$area',
                totalComplaints: { $sum: 1 },
                statuses: { $addToSet: '$status' }
            }
        },
        { $sort: { totalComplaints: -1 } }
    ]);
    console.table(areaStats.map(s => ({
        Area: s._id,
        TotalComplaints: s.totalComplaints,
        ActiveStatuses: s.statuses.join(', ')
    })));

    // ---------------------------------------------------------
    // 6. DELETE (D) OPERATIONS
    // ---------------------------------------------------------
    console.log('\n--- 6. DELETE (REMOVE) OPERATIONS ---');

    // 6.1 deleteOneRecord: Delete a specific complaint by ID
    console.log(`6.1: deleteOneRecord() — Deleting complaint ${_idShort(singleRes.insertedId)}:`);
    const deleteOneRes = await deleteOneRecord(COLLECTION, { _id: singleRes.insertedId });
    console.log(`Deleted Count: ${deleteOneRes.deletedCount}`);

    // Verify it is gone
    const checkDeleted = await readById(COLLECTION, singleRes.insertedId);
    console.log(`Document still exists? ${checkDeleted !== null ? 'Yes' : 'No (Successfully Removed)'}`);

    // 6.2 deleteManyRecords: Remove all resolved complaints
    console.log('\n6.2: deleteManyRecords() — Purging all complaints with status = "resolved":');
    const deleteManyRes = await deleteManyRecords(COLLECTION, { status: 'resolved' });
    console.log(`Deleted Count: ${deleteManyRes.deletedCount}`);

    // Final state of collection
    console.log('\n--- FINAL REMAINING DOCUMENTS IN COLLECTION ---');
    const finalDocs = await readAll(COLLECTION);
    console.log(`Total remaining documents: ${finalDocs.length}`);
    console.table(finalDocs.map(c => ({
        ID: c._id.toString().slice(-8),
        Description: c.description.slice(0, 35) + '...',
        Area: c.area,
        Priority: c.priority,
        Status: c.status
    })));

    console.log('\n========================================================================');
    console.log('   PRACTICAL - 10: MONGODB CRUD DEMONSTRATION COMPLETE');
    console.log('========================================================================\n');
}

function _idShort(id) {
    return id ? id.toString().slice(-8) : '';
}

main()
    .catch(err => {
        console.error(explainMongoError(err));
        process.exitCode = 1;
    })
    .finally(() => closeMongo().then(() => console.log('MongoDB connection closed cleanly.')));
