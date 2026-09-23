#!/usr/bin/env node
'use strict';

/**
 * FixLink seeder runner (development data only — fictional South African data).
 *
 * Usage (from repo root):
 *   DB_PASSWORD=... node database/seed.js        # apply pending seed files
 *   DB_PASSWORD=... node database/seed.js status # show applied / pending
 *
 * Seed files: database/seeders/NNN_name.sql, applied in filename order.
 * Applied files are tracked in `schema_seeds` so re-runs are safe no-ops.
 * Seeds assume migrations are fully applied. To rebuild from scratch:
 *   node database/migrate.js reset && node database/seed.js
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getConfig, splitStatements, listSqlFiles, runStatements } = require('./db');

const SEEDERS_DIR = path.join(__dirname, 'seeders');

async function ensureSeedsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS \`schema_seeds\` (
      \`seed_file\` VARCHAR(128) NOT NULL,
      \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`seed_file\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function appliedSeeds(conn) {
  const [rows] = await conn.query('SELECT `seed_file` FROM `schema_seeds` ORDER BY `seed_file`');
  return new Set(rows.map((r) => r.seed_file));
}

async function main() {
  const [cmd] = process.argv.slice(2);
  const config = getConfig();
  const conn = await mysql.createConnection({ ...config, multipleStatements: false });
  try {
    await ensureSeedsTable(conn);
    const files = listSqlFiles(SEEDERS_DIR);
    const applied = await appliedSeeds(conn);
    if (cmd === 'status') {
      for (const f of files) console.log(`${applied.has(f) ? 'applied' : 'pending'}  ${f}`);
      return;
    }
    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('No pending seeds.');
      return;
    }
    for (const f of pending) {
      console.log(`Seeding ${f} ...`);
      const sql = fs.readFileSync(path.join(SEEDERS_DIR, f), 'utf8');
      await runStatements(conn, splitStatements(sql));
      await conn.query('INSERT INTO `schema_seeds` (`seed_file`) VALUES (?)', [f]);
      console.log(`Seeded ${f}.`);
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`Seeding failed: ${err.message}`);
  process.exitCode = 1;
});
