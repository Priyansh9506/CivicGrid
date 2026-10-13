/*
 * Practical - 8 (II): User-defined functions for
 *                     delete record, select record, select unique and select all.
 * Table and column names are escaped with mysql.escapeId, values are always bound with `?`.
 */

const { mysql, query } = require('./db');

// Build "col1 = ? AND col2 = ?" from { col1: v1, col2: v2 }
function buildWhere(conditions) {
    const keys = Object.keys(conditions || {});
    if (keys.length === 0) throw new Error('A WHERE condition is required');
    return {
        clause: keys.map(k => `${mysql.escapeId(k)} = ?`).join(' AND '),
        values: keys.map(k => conditions[k])
    };
}

function columnList(columns) {
    return columns && columns.length ? columns.map(c => mysql.escapeId(c)).join(', ') : '*';
}

// SELECT all rows of a table
function selectAll(table, { columns, orderBy } = {}) {
    let sql = `SELECT ${columnList(columns)} FROM ${mysql.escapeId(table)}`;
    if (orderBy) sql += ` ORDER BY ${mysql.escapeId(orderBy)}`;
    return query(sql);
}

// SELECT the rows matching the conditions (returns an array)
function selectRecord(table, conditions, { columns } = {}) {
    const { clause, values } = buildWhere(conditions);
    return query(`SELECT ${columnList(columns)} FROM ${mysql.escapeId(table)} WHERE ${clause}`, values);
}

// SELECT DISTINCT values of one column
async function selectUnique(table, column) {
    const rows = await query(
        `SELECT DISTINCT ${mysql.escapeId(column)} AS value FROM ${mysql.escapeId(table)} ORDER BY value`);
    return rows.map(r => r.value);
}

// DELETE the rows matching the conditions (returns the number deleted)
async function deleteRecord(table, conditions) {
    const { clause, values } = buildWhere(conditions);
    const result = await query(`DELETE FROM ${mysql.escapeId(table)} WHERE ${clause}`, values);
    return result.affectedRows;
}

module.exports = { selectAll, selectRecord, selectUnique, deleteRecord };
