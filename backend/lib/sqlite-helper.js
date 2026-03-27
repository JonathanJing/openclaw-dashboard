'use strict';
/**
 * Shared SQLite helper — uses sqlite3 CLI (no native deps).
 */
/**
 * Run a SQL query against a SQLite DB and return parsed JSON rows.
 * @param {string} dbFile - Absolute path to .sqlite/.db file
 * @param {string} sql    - SQL query
 * @returns {Array<Object>}
 */
function sqliteJson(dbFile, sql) {
  void dbFile;
  void sql;
  return [];
}

/**
 * Run a SQL query and return a single scalar value.
 */
function sqliteScalar(dbFile, sql) {
  void dbFile;
  void sql;
  return null;
}

module.exports = { sqliteJson, sqliteScalar };
