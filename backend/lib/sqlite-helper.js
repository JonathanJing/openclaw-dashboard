'use strict';
/**
 * Shared SQLite helper — uses sqlite3 CLI (no native deps).
 */
const { execFileSync } = require('child_process');

/**
 * Run a SQL query against a SQLite DB and return parsed JSON rows.
 * @param {string} dbFile - Absolute path to .sqlite/.db file
 * @param {string} sql    - SQL query
 * @returns {Array<Object>}
 */
function sqliteJson(dbFile, sql) {
  try {
    const out = execFileSync('sqlite3', [dbFile, '-json', sql], {
      encoding: 'utf8',
      timeout: 10000,
    });
    if (!out || !out.trim()) return [];
    return JSON.parse(out);
  } catch (e) {
    console.error(`[sqlite] query failed on ${dbFile}: ${e.message}`);
    return [];
  }
}

/**
 * Run a SQL query and return a single scalar value.
 */
function sqliteScalar(dbFile, sql) {
  try {
    const out = execFileSync('sqlite3', [dbFile, sql], {
      encoding: 'utf8',
      timeout: 10000,
    });
    return out.trim();
  } catch {
    return null;
  }
}

module.exports = { sqliteJson, sqliteScalar };
