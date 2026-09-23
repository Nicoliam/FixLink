'use strict';

/**
 * Shared helpers for FixLink database tooling (migrate.js, seed.js, tests).
 * - Minimal .env loader (no external dependency).
 * - Connection config from environment.
 * - Naive-but-safe SQL statement splitter (statements end with `;` at EOL).
 */

const fs = require('fs');
const path = require('path');

const DB_DIR = __dirname;

function loadEnv() {
  // Already-provided environment wins. Otherwise try repo-root .env, then database/.env.
  const candidates = [
    path.join(DB_DIR, '..', '.env'),
    path.join(DB_DIR, '.env'),
  ];
  for (const file of candidates) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function getConfig() {
  loadEnv();
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3307),
    user: process.env.DB_USER || 'fixlink',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fixlink',
  };
}

/**
 * Split SQL text into individual statements. Statements are terminated by a
 * semicolon at end of line. Comment-only lines (--) and empty lines are
 * skipped. Safe for this repo: no stored procedures/triggers/embedded `;`.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  for (const rawLine of sql.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('--')) continue;
    current += line + '\n';
    if (trimmed.endsWith(';')) {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = '';
    }
  }
  const rest = current.trim();
  if (rest) statements.push(rest);
  return statements;
}

function listSqlFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

async function runStatements(conn, statements) {
  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

module.exports = { DB_DIR, loadEnv, getConfig, splitStatements, listSqlFiles, runStatements };
