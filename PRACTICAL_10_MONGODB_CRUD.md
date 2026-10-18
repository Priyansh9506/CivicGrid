# Practical 10: Node.js with MongoDB CRUD Operations

> **Course:** Full Stack Development (FSD) Lab  
> **Branch:** `practical-10`  
> **Project:** CivicGrid — Area-Wise Civic Issue & Task Management System  
> **Technology Stack:** JavaScript, Node.js (v20+), Official MongoDB Driver (`mongodb` v7), Express, MongoDB (Port 27017)

---

## 📌 1. Aim & Objective

**Aim:** To demonstrate Node.js using MongoDB to perform **Create**, **Read**, **Update**, and **Delete** (CRUD) operations on a civic issues database using modular, user-defined functions and the official MongoDB native driver.

### Key Learning Objectives:
1. Establish and manage persistent connection pooling to a local/remote MongoDB server via `MongoClient`.
2. Implement user-defined wrapper functions for BSON document manipulation.
3. Perform **CREATE** operations: inserting single (`insertOne`) and batch (`insertMany`) documents.
4. Perform **READ** operations: querying all documents, filtering by fields (`area`, `status`, `priority`), applying projections, and querying distinct values.
5. Perform **UPDATE** operations: modifying single documents (`updateOne` with `$set` and timestamp) and bulk updating (`updateMany`).
6. Perform **DELETE** operations: removing individual documents by `_id` (`deleteOne`) and bulk purging (`deleteMany`).
7. Execute an **Aggregation Pipeline** (`$group`, `$sum`, `$sort`) for zonal analytics.
8. Expose MongoDB operations over an Express REST API (`/api/mongo/*`).

---

## 📊 2. RDBMS (MySQL) vs NoSQL (MongoDB) Concept Comparison

In Practical 8 & 9, CivicGrid used MySQL (relational). In Practical 10, CivicGrid introduces MongoDB (document-oriented NoSQL):

| Concept / Feature | MySQL (Practical 8 & 9) | MongoDB (Practical 10) |
|---|---|---|
| **Data Model** | Relational Tables & Columns | Schema-flexible JSON/BSON Documents |
| **Data Container** | Table (`complaints`) | Collection (`civic_complaints`) |
| **Record Unit** | Row / Tuple | BSON Document |
| **Primary Key** | `id INT AUTO_INCREMENT` | `_id ObjectId("6ad4e495...")` |
| **Query Language** | SQL (`SELECT * FROM complaints WHERE ...`) | Object Query (`col.find({ area: 'Paldi' })`) |
| **Related Data** | Foreign Keys (`user_id`, `zone_id`) + `JOIN` | Embedded sub-documents (`reporter: { ... }`) |
| **Node.js Driver** | `mysql2` | `mongodb` (`MongoClient`) |

---

## 🛠️ 3. Architecture & File Structure

```
CivicGrid/
├── connection/
│   ├── mongo-config.js      # MongoDB URI, database name, and error diagnostics
│   ├── mongo-db.js          # MongoClient connection pooling & ping verification
│   ├── mongo-crud.js        # User-defined CRUD functions (Create, Read, Update, Delete)
│   └── mongo-crud-demo.js   # Automated CLI demonstration script
├── server.js                # Express REST API with /api/mongo/* endpoints
├── package.json             # Includes "mongo-demo" script
├── .env.example             # Template with MONGO_URI and MONGO_DB_NAME
└── PRACTICAL_10_MONGODB_CRUD.md # Documentation
```

---

## 💻 4. User-Defined MongoDB CRUD Functions

All CRUD logic is abstracted in [`connection/mongo-crud.js`](connection/mongo-crud.js):

### 1. CREATE Operations
```javascript
// Insert single document with automatic createdAt timestamp
async function createOne(collectionName, document) {
    const col = getCollection(collectionName);
    const docWithMeta = { ...document, createdAt: document.createdAt || new Date() };
    const result = await col.insertOne(docWithMeta);
    return { acknowledged: result.acknowledged, insertedId: result.insertedId, document: { _id: result.insertedId, ...docWithMeta } };
}

// Batch insert array of documents
async function createMany(collectionName, documents) {
    const col = getCollection(collectionName);
    const now = new Date();
    const docs = documents.map(d => ({ ...d, createdAt: d.createdAt || now }));
    const result = await col.insertMany(docs);
    return { acknowledged: result.acknowledged, insertedCount: result.insertedCount, insertedIds: result.insertedIds };
}
```

### 2. READ Operations
```javascript
// Read all documents with optional filter, projection, sort, and pagination
async function readAll(collectionName, { filter = {}, projection, sort, limit = 0, skip = 0 } = {}) {
    const col = getCollection(collectionName);
    let cursor = col.find(filter);
    if (projection) cursor = cursor.project(projection);
    if (sort) cursor = cursor.sort(sort);
    if (skip > 0) cursor = cursor.skip(skip);
    if (limit > 0) cursor = cursor.limit(limit);
    return cursor.toArray();
}

// Read single document matching filter
async function readOne(collectionName, filter = {}, { projection } = {}) {
    return getCollection(collectionName).findOne(filter, projection ? { projection } : {});
}

// Read by _id (supports string or ObjectId)
async function readById(collectionName, id, options = {}) {
    return readOne(collectionName, { _id: toObjectId(id) }, options);
}

// Read distinct unique values of a field
async function readDistinct(collectionName, field, filter = {}) {
    return getCollection(collectionName).distinct(field, filter);
}
```

### 3. UPDATE Operations
```javascript
// Update single document with $set and updatedAt timestamp
async function updateOneRecord(collectionName, filter, updateData, options = {}) {
    const col = getCollection(collectionName);
    const hasOperators = Object.keys(updateData).some(k => k.startsWith('$'));
    const updateDoc = hasOperators ? updateData : { $set: { ...updateData, updatedAt: new Date() } };
    return col.updateOne(filter, updateDoc, options);
}

// Batch update multiple documents matching filter
async function updateManyRecords(collectionName, filter, updateData) {
    const col = getCollection(collectionName);
    const hasOperators = Object.keys(updateData).some(k => k.startsWith('$'));
    const updateDoc = hasOperators ? updateData : { $set: { ...updateData, updatedAt: new Date() } };
    return col.updateMany(filter, updateDoc);
}
```

### 4. DELETE Operations
```javascript
// Delete single document matching filter or ID
async function deleteOneRecord(collectionName, filter) {
    return getCollection(collectionName).deleteOne(filter);
}

// Bulk delete multiple documents matching filter
async function deleteManyRecords(collectionName, filter) {
    return getCollection(collectionName).deleteMany(filter);
}
```

### 5. Advanced Analytics (Aggregation Pipeline)
```javascript
// Aggregation pipeline stage processing
async function aggregateRecords(collectionName, pipeline) {
    return getCollection(collectionName).aggregate(pipeline).toArray();
}
```

---

## 🚀 5. How to Run the Demonstration

### Step 1: Ensure MongoDB Server is Running
Verify MongoDB is active on `localhost:27017` (e.g., Windows Service `MongoDB` or `mongod`).

### Step 2: Run the CLI Demonstration
Execute the automated test script in the terminal:

```bash
npm run mongo-demo
# or
node connection/mongo-crud-demo.js
```

---

## 🖥️ 6. CLI Execution Walkthrough & Results

When `npm run mongo-demo` is executed, the following 6-step lifecycle runs automatically:

```
========================================================================
   PRACTICAL - 10: NODE.JS WITH MONGODB CRUD DEMONSTRATION
========================================================================

--- 1. CONNECTING TO MONGODB ---
Connecting to URI: mongodb://127.0.0.1:27017
Target Database:   civicgrid_mongo
✅ Connected and successfully pinged MongoDB server!

--- 2. CREATE (INSERT) OPERATIONS ---
2.1: createOne() — Inserting a single civic complaint:
✅ Single complaint inserted with _id: 6ad4e495ee2582fe14698541

2.2: createMany() — Inserting batch of 4 complaints across zones:
✅ Inserted 4 documents successfully.
   Generated ObjectIds: [
     '6ad4e495ee2582fe14698542',
     '6ad4e495ee2582fe14698543',
     '6ad4e495ee2582fe14698544',
     '6ad4e495ee2582fe14698545'
   ]

--- 3. READ (QUERY) OPERATIONS ---
3.1: readAll() — Fetching all complaints in collection:
┌─────────┬────────────┬──────────────────────────────────────────┬───────────────┬──────────┬──────────────┬────────────────┐
│ (index) │ ID         │ Description                              │ Area          │ Priority │ Status       │ Reporter       │
├─────────┼────────────┼──────────────────────────────────────────┼───────────────┼──────────┼──────────────┼────────────────┤
│ 0       │ '14698541' │ 'Deep pothole causing traffic jam ne...' │ 'Satellite'   │ 'High'   │ 'reported'   │ 'Aarav Mehta'  │
│ 1       │ '14698542' │ 'Streetlight bulb flickering and mal...' │ 'Navrangpura' │ 'Medium' │ 'reported'   │ 'Priya Shah'   │
│ 2       │ '14698543' │ 'Garbage dump overflow near market a...' │ 'Paldi'       │ 'High'   │ 'reported'   │ 'Ramesh Patel' │
│ 3       │ '14698544' │ 'Broken water supply pipeline causin...' │ 'Paldi'       │ 'Low'    │ 'inprogress' │ 'Sneha Joshi'  │
│ 4       │ '14698545' │ 'Fallen tree branch obstructing pede...' │ 'Downtown'    │ 'Medium' │ 'resolved'   │ 'Vikram Desai' │
└─────────┴────────────┴──────────────────────────────────────────┴───────────────┴──────────┴──────────────┴────────────────┘

3.2: readOne({ area: "Satellite" }) — Querying specific document:
{
  _id: new ObjectId('6ad4e495ee2582fe14698541'),
  description: 'Deep pothole causing traffic jam near SG Highway crossroad',
  area: 'Satellite',
  reporter: { name: 'Aarav Mehta', mobile: '9876543210', aadhar: '111122223333' },
  location: 'Opp. ISKCON Temple, SG Highway',
  status: 'reported'
}

3.3: Conditional Filter — status: "reported" AND priority: "High":
Matched 2 complaints matching both criteria.

3.4: Projection — Fetching only { description: 1, area: 1, status: 1, _id: 0 }:
Returns clean JSON objects omitting unwanted fields and _id.

3.5: readDistinct() — Unique areas and statuses:
Distinct Areas:    ["Downtown", "Navrangpura", "Paldi", "Satellite"]
Distinct Statuses: ["inprogress", "reported", "resolved"]

--- 4. UPDATE (MODIFY) OPERATIONS ---
4.1: updateOneRecord() — Advancing complaint 14698541 to "inprogress":
Matched: 1, Modified: 1
Document updated with assigned officer and updatedAt timestamp.

4.2: updateManyRecords() — Upgrading all "Paldi" complaints to priority: "Urgent":
Matched: 2, Modified: 2

--- 5. AGGREGATION PIPELINE (GROUP & COUNT) ---
Aggregating complaints grouped by Area:
┌─────────┬───────────────┬─────────────────┬────────────────────────┐
│ (index) │ Area          │ TotalComplaints │ ActiveStatuses         │
├─────────┼───────────────┼─────────────────┼────────────────────────┤
│ 0       │ 'Paldi'       │ 2               │ 'reported, inprogress' │
│ 1       │ 'Satellite'   │ 1               │ 'inprogress'           │
│ 2       │ 'Downtown'    │ 1               │ 'resolved'             │
│ 3       │ 'Navrangpura' │ 1               │ 'reported'             │
└─────────┴───────────────┴─────────────────┴────────────────────────┘

--- 6. DELETE (REMOVE) OPERATIONS ---
6.1: deleteOneRecord() — Deleting complaint 14698541:
Deleted Count: 1 (Verification: Document no longer exists)

6.2: deleteManyRecords() — Purging all complaints with status = "resolved":
Deleted Count: 1

--- FINAL REMAINING DOCUMENTS IN COLLECTION ---
Total remaining documents: 3

MongoDB connection closed cleanly.
```

---

## 🌐 7. Express REST API Reference (`/api/mongo/*`)

MongoDB operations are also exposed via HTTP REST endpoints in [`server.js`](server.js):

| HTTP Method | Endpoint URL | Description | Request Body / Query Params |
|---|---|---|---|
| **GET** | `/api/mongo/complaints` | Fetch all complaints | Optional query: `?area=Paldi&status=reported&priority=High` |
| **GET** | `/api/mongo/complaints/:id` | Fetch complaint by `_id` | `:id` (24-char hex string) |
| **POST** | `/api/mongo/complaints` | Insert single complaint | JSON: `{ description, area, priority, reporter, tags }` |
| **POST** | `/api/mongo/complaints/batch` | Insert batch of complaints | JSON: `{ complaints: [ {...}, {...} ] }` |
| **PATCH** | `/api/mongo/complaints/:id` | Update complaint fields | JSON: `{ status: "resolved", officerRemarks: "Fixed" }` |
| **DELETE** | `/api/mongo/complaints/:id` | Delete complaint by `_id` | `:id` (24-char hex string) |
| **GET** | `/api/mongo/stats` | Aggregated analytics | Returns `{ byArea: [...], byStatus: [...] }` |

---

## 🎓 8. Viva Questions & Key Concepts

### Q1: What is an `ObjectId` in MongoDB?
**Ans:** `ObjectId` is a 12-byte BSON type used as the default unique identifier (`_id`) for documents. It is composed of:
* 4-byte timestamp (seconds since Unix epoch)
* 5-byte random value (machine and process identifier)
* 3-byte incrementing counter

### Q2: What is the difference between `updateOne` and `updateMany`?
**Ans:**
* `updateOne(filter, updateDoc)` locates the **first document** that matches the filter and applies the update.
* `updateMany(filter, updateDoc)` applies the update to **all documents** that match the filter across the collection.

### Q3: Why should update fields be wrapped with the `$set` operator?
**Ans:** Without `$set`, MongoDB will overwrite and replace the entire existing document with the provided object. With `$set`, only the specified fields are modified, preserving the rest of the document.

### Q4: What is the role of `MongoClient` connection pooling?
**Ans:** `MongoClient` maintains an internal pool of active TCP connections to the MongoDB server. Reusing connections avoids the high latency overhead of establishing a new TCP handshake for every database query.

### Q5: What is an Aggregation Pipeline in MongoDB?
**Ans:** An aggregation framework where documents pass through a multi-stage pipeline (e.g., `$match` → `$group` → `$sort` → `$project`). It allows computing aggregated values (counts, sums, averages, grouping) directly on the database engine.
