/*
 * Practical - 8 (II): Demonstrate Node.js using MySQL to perform the below operations
 *                     using user-defined functions: delete record, select record,
 *                     select unique and select all.
 *
 * Run:  npm run crud-demo   (or: node connection/crud-demo.js)
 */

const { initDatabase, closeConnection } = require('./setup');
const { query, closePool } = require('./db');
const { selectAll, selectRecord, selectUnique, deleteRecord } = require('./crud');
const { explainDbError } = require('./config');

async function main() {
    // Make sure the database and tables exist first
    const setupConn = await initDatabase();
    await closeConnection(setupConn, () => {});

    // Insert a throw-away record so there is something to delete
    const inserted = await query(
        `INSERT INTO complaints
            (zone_id, description, reporter_name, reporter_aadhar, reporter_age,
             reporter_gender, reporter_residence, location_label)
         VALUES ((SELECT id FROM zones WHERE name = 'Downtown'), 'Temporary record for delete demo',
                 'Demo User', '999999999999', 40, 'Female', 'Demo Street', 'Downtown')`);
    console.log(`Inserted temporary complaint id ${inserted.insertId}\n`);

    // 1. Select all
    console.log('1. selectAll("zones")');
    console.table(await selectAll('zones', { orderBy: 'id' }));

    // 2. Select record
    console.log(`2. selectRecord("complaints", { id: ${inserted.insertId} })`);
    console.table(await selectRecord('complaints', { id: inserted.insertId },
        { columns: ['id', 'description', 'reporter_name', 'status'] }));

    // 3. Select unique
    console.log('3. selectUnique("complaints", "status")');
    console.log(await selectUnique('complaints', 'status'), '\n');

    // 4. Delete record
    console.log(`4. deleteRecord("complaints", { id: ${inserted.insertId} })`);
    const deleted = await deleteRecord('complaints', { id: inserted.insertId });
    console.log(`Rows deleted: ${deleted}`);
    console.log('Still there?', (await selectRecord('complaints', { id: inserted.insertId })).length > 0);
}

main()
    .catch(err => {
        console.error(explainDbError(err));
        process.exitCode = 1;
    })
    .finally(() => closePool().then(() => console.log('Connection closed')));
