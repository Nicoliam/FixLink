#!/usr/bin/env node
'use strict';

/**
 * FixLink migration runner.
 *
 * Usage (from repo root):
 *   DB_PASSWORD=... node database/migrate.js up        # apply pending migrations
 *   DB_PASSWORD=... node database/migrate.js status    # show applied / pending
 *   DB_PASSWORD=... node database/migrate.js down [n]  # revert last n (default 1)
 *   DB_PASSWORD=... node database/migrate.js reset     # revert ALL then re-apply ALL
 *
 * Migration files: database/migrations/NNN_name.sql with `-- +migrate Up`
 * and `-- +migrate Down` sections. Applied versions are tracked in
 * `schema_migrations`. Migrations are ordered by filename and reproducible.
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { getConfig, splitStatements, listSqlFiles, runStatements } = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DOWN_MARKER = '-- +migrate Down';

function parseMigration(file) {
  const raw = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const idx = raw.indexOf(DOWN_MARKER);
  if (idx === -1) throw new Error(`Migration ${file} is missing the "${DOWN_MARKER}" section.`);
  return {
    version: file.replace(/\.sql$/, ''),
    up: splitStatements(raw.slice(0, idx)),
    down: splitStatements(raw.slice(idx + DOWN_MARKER.length)),
  };
}

async function ensureMigrationsTable(conn) {
  await conn.query(
    `CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
      \`version\` VARCHAR(64) NOT NULL,
      \`applied_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`version\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
}

async function appliedVersions(conn) {
  const [rows] = await conn.query('SELECT `version` FROM `schema_migrations` ORDER BY `version`');
  return new Set(rows.map((r) => r.version));
}

async function cmdStatus(conn) {
  const files = listSqlFiles(MIGRATIONS_DIR);
  const applied = await appliedVersions(conn);
  for (const f of files) {
    const v = f.replace(/\.sql$/, '');
    console.log(`${applied.has(v) ? 'applied' : 'pending'}  ${v}`);
  }
}

async function cmdUp(conn) {
  const files = listSqlFiles(MIGRATIONS_DIR);
  const applied = await appliedVersions(conn);
  const pending = files.filter((f) => !applied.has(f.replace(/\.sql$/, '')));
  if (pending.length === 0) {
    console.log('No pending migrations.');
    return;
  }
  for (const f of pending) {
    const m = parseMigration(f);
    console.log(`Applying ${m.version} ...`);
    await runStatements(conn, m.up);
    await conn.query('INSERT INTO `schema_migrations` (`version`) VALUES (?)', [m.version]);
    console.log(`Applied ${m.version}.`);
  }
}

async function cmdDown(conn, steps) {
  const applied = await appliedVersions(conn);
  const files = listSqlFiles(MIGRATIONS_DIR).reverse();
  const toRevert = files
    .filter((f) => applied.has(f.replace(/\.sql$/, '')))
    .slice(0, steps);
  if (toRevert.length === 0) {
    console.log('Nothing to revert.');
    return;
  }
  for (const f of toRevert) {
    const m = parseMigration(f);
    console.log(`Reverting ${m.version} ...`);
    await runStatements(conn, m.down);
    await conn.query('DELETE FROM `schema_migrations` WHERE `version` = ?', [m.version]);
    console.log(`Reverted ${m.version}.`);
  }
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  const config = getConfig();
  const conn = await mysql.createConnection({ ...config, multipleStatements: false });
  try {
    await ensureMigrationsTable(conn);
    if (cmd === 'up' || cmd === undefined) await cmdUp(conn);
    else if (cmd === 'status') await cmdStatus(conn);
    else if (cmd === 'down') await cmdDown(conn, Math.max(1, Number(arg || 1)));
    else if (cmd === 'reset') {
      await cmdDown(conn, Number.MAX_SAFE_INTEGER);
      await cmdUp(conn);
      // Data tables are empty again, so previously-applied seed records are stale.
      await conn.query(
        'DELETE FROM `schema_seeds`'
      ).catch(() => {});
      console.log('Reset complete. Run `node seed.js` to reload development seed data.');
    } else {
      console.error(`Unknown command: ${cmd}. Use up | status | down [n] | reset.`);
      process.exitCode = 1;
    }
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`Migration failed: ${err.message}`);
  process.exitCode = 1;
});
