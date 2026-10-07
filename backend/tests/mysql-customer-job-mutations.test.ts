/**
 * Real-MySQL tests for the Step 15 customer mutations (edit / cancel /
 * soft delete).
 *
 * WHY THIS FILE EXISTS
 *
 * Every other suite in this directory runs against `MemoryJobsStore`. That is
 * fast, but it means a green `npm test` says nothing whatsoever about the SQL
 * in `MysqlJobsStore` — the code that actually runs in development and
 * production. Three real bugs lived in exactly that gap:
 *
 *   1. `getJobById` and `requireJob` omitted `deleted_at IS NULL`, so a
 *      soft-deleted request still returned 200 on its detail URL.
 *   2. Four write-path job loads in `MysqlQuotesStore` omitted the filter, so
 *      a professional could submit and accept quotes against a request the
 *      customer had withdrawn.
 *   3. `listProviderRequests` in the memory store diverged from its MySQL
 *      counterpart, hiding a filter the SQL already had.
 *
 * None of them were reachable from an in-memory test. These run the real
 * stores against a real MySQL server on a throwaway database.
 *
 * DATABASE HANDLING
 *
 * Each run creates `fixlynk_test_<random>`, applies every migration's Up
 * section in order, and drops it afterwards. The development database is
 * never touched.
 *
 * Two non-obvious requirements, both discovered the hard way:
 *
 *   - The migrations are golang-migrate style: an Up section and a
 *     `-- +migrate Down` section that DROPs the same objects. Sending the
 *     whole file applies Up and then Down, which *succeeds* and leaves an
 *     empty schema. See `upSectionOnly`.
 *   - MySQL grants are per schema, so the least-privilege application user
 *     cannot create a scratch database nor see one that root creates. This
 *     file connects as the container's admin account (override with
 *     FIXLYNK_MYSQL_ADMIN_USER / _PASSWORD). Safe only because the scratch
 *     database is dropped at the end and never holds real data.
 *
 * If MySQL is unreachable the suite SKIPS with an explanation rather than
 * failing, so `npm test` still works on a machine with no database. Run
 * `npm run test:mysql` to turn that skip into a hard failure — that is the
 * command for CI, where a silent skip is worse than a red build.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { after, before, describe, it } from 'node:test';
import { MysqlJobsStore } from '../src/modules/jobs/mysql-jobs.store';
import { MysqlQuotesStore } from '../src/modules/quotes/mysql-quotes.store';



const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(HERE, '../../database/migrations');

// The repository's own migration helpers, so this suite applies migrations
// exactly as `npm run db:migrate` does rather than through a second, subtly
// different implementation. Plain CommonJS, hence the untyped require.
interface DbHelpers {
  getConfig(): { host: string; port: number; user: string; password: string; database: string };
  splitStatements(sql: string): string[];
  listSqlFiles(dir: string): string[];
  runStatements(conn: mysql.Connection, statements: string[]): Promise<void>;
}
const dbTools = require(path.resolve(HERE, '../../database/db.js')) as DbHelpers;

/** Fail loudly instead of skipping when set (used by `npm run test:mysql`). */
const MYSQL_REQUIRED = process.env['FIXLYNK_REQUIRE_MYSQL'] === '1';

let admin: mysql.Connection | null = null;
let pool: mysql.Pool | null = null;
let scratchDb: string | null = null;

function adminCredentials(): { host: string; port: number; user: string; password: string } {
  return {
    host: process.env['DB_HOST'] ?? '127.0.0.1',
    port: Number(process.env['DB_PORT'] ?? 3307),
    user: process.env['FIXLYNK_MYSQL_ADMIN_USER'] ?? 'root',
    password: process.env['FIXLYNK_MYSQL_ADMIN_PASSWORD'] ?? 'root_dev_password',
  };
}

/**
 * Read `backend/.env` into process.env without overwriting real values, so the
 * test uses the same database the developer has configured.
 */
function loadDotEnv(): void {
  try {
    const raw = readFileSync(path.resolve(HERE, '../.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i.exec(line);
      if (!match) continue;
      const key = match[1] as string;
      let value = (match[2] as string).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    // No .env: fall back to the defaults above.
  }
}

/**
 * Statements of a migration's Up section only.
 *
 * The files are golang-migrate style: an Up section followed by a
 * `-- +migrate Down` section that DROPs the same objects. Handing the whole
 * file to the server applies Up and then Down, which *succeeds* and leaves an
 * empty schema — the exact failure this function exists to prevent.
 */
function upStatements(sql: string, file: string): string[] {
  const lines = sql.split('\n');
  const upAt = lines.findIndex((line) => /^\s*--\s*\+migrate\s+Up\s*$/i.test(line));
  const downAt = lines.findIndex((line) => /^\s*--\s*\+migrate\s+Down\s*$/i.test(line));
  assert.notEqual(upAt, -1, `${file} has no '-- +migrate Up' marker`);
  assert.notEqual(downAt, -1, `${file} has no '-- +migrate Down' marker`);
  assert.ok(downAt > upAt, `${file} has its Down section before its Up section`);
  const statements = dbTools.splitStatements(lines.slice(upAt + 1, downAt).join('\n'));
  assert.ok(statements.length > 0, `${file} has an empty Up section`);
  return statements;
}

async function setUpDatabase(): Promise<boolean> {
  loadDotEnv();
  const credentials = adminCredentials();
  try {
    admin = await mysql.createConnection({ ...credentials, connectTimeout: 5000 });
  } catch {
    admin = null;
  }
  if (admin === null) {
    if (MYSQL_REQUIRED) {
      throw new Error(
        `FIXLYNK_REQUIRE_MYSQL=1 but no MySQL server answered at ` +
          `${credentials.host}:${credentials.port}. These tests are the only coverage of ` +
          `MysqlJobsStore, so they must not be skipped silently.`,
      );
    }
    console.warn(
      `\n[MySQL job mutations] SKIPPED — no MySQL server at ${credentials.host}:${credentials.port}. ` +
        `Run \`npm run test:mysql\` to require these.\n`,
    );
    return false;
  }

  scratchDb = `fixlynk_test_${randomBytes(6).toString('hex')}`;
  await admin.query(
    `CREATE DATABASE \`${scratchDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  );
  pool = mysql.createPool({ ...credentials, database: scratchDb, connectionLimit: 4 });

  const files = dbTools.listSqlFiles(MIGRATIONS_DIR);
  assert.ok(files.length > 0, `no migrations found in ${MIGRATIONS_DIR}`);
  const applyConnection = await pool.getConnection();
  try {
    for (const file of files) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await dbTools.runStatements(applyConnection, upStatements(sql, file));
      } catch (error) {
        throw new Error(`migration ${file} failed: ${(error as Error).message}`);
      }
    }
  } finally {
    applyConnection.release();
  }

  // Guard the guard. If the Up/Down split ever broke again, every migration
  // would run its own Down section and "succeed" against an empty schema —
  // which would otherwise surface as a baffling missing-table error much
  // later, in whichever test happened to touch it first.
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    'SELECT COUNT(*) AS `n` FROM information_schema.tables WHERE table_schema = ?',
    [scratchDb],
  );
  const tableCount = Number(rows[0]?.['n'] ?? 0);
  assert.ok(tableCount > 0, 'migrations reported success but created no tables');
  return true;
}

// ---------------------------------------------------------------------------
// The suites below only run when setUpDatabase() actually built a schema.
// `store` and `quotesStore` are populated in `before`, which node:test awaits
// before the first `it`.
// ---------------------------------------------------------------------------

let store: MysqlJobsStore;
let quotesStore: MysqlQuotesStore;

async function seedFixtures(): Promise<void> {
  assert.ok(pool !== null, 'no pool: the database was not available');
  const db = pool;
  await db.query(
    `INSERT INTO service_categories (\`id\`, \`name\`, \`slug\`, \`is_active\`, \`created_at\`)
     VALUES (9001, 'Plumbing', 'plumbing-test', 1, NOW())`,
  );
  await db.query(
    `INSERT INTO services (\`id\`, \`category_id\`, \`name\`, \`slug\`, \`is_active\`, \`created_at\`)
     VALUES (9001, 9001, 'Leak Repair', 'leak-repair-test', 1, NOW())`,
  );
  // Profiles hang off `users`, which has no auto-created row for them, so the
  // login users are inserted explicitly. The password hash is a throwaway.
  await db.query(
    `INSERT INTO users (\`id\`, \`email\`, \`phone\`, \`password_hash\`, \`status\`, \`created_at\`)
     VALUES (9001, 'mysql-test-customer@example.co.za', '0710000001', 'x', 'ACTIVE', NOW()),
            (9002, 'mysql-test-pro@example.co.za',     '0710000002', 'x', 'ACTIVE', NOW())`,
  );
  await db.query(
    `INSERT INTO customer_profiles (\`id\`, \`user_id\`, \`first_name\`, \`last_name\`, \`created_at\`)
     VALUES (9001, 9001, 'Test', 'Customer', NOW())`,
  );
  await db.query(
    `INSERT INTO professional_profiles (\`id\`, \`user_id\`, \`display_name\`, \`created_at\`)
     VALUES (9001, 9002, 'Test Pro', NOW())`,
  );

  store = new MysqlJobsStore(db);
  quotesStore = new MysqlQuotesStore(db);
}

let nextReference = 1;

/** Insert one marketplace job addressed to the test professional. */
async function seedJob(status = 'REQUESTED'): Promise<string> {
  assert.ok(pool !== null, 'no pool');
  const reference = `FL-TEST-${String(nextReference++).padStart(6, '0')}`;
  const [result] = await pool.query<mysql.ResultSetHeader>(
    `INSERT INTO jobs
       (\`reference\`, \`source\`, \`customer_id\`, \`professional_id\`, \`service_id\`,
        \`description\`, \`address_line1\`, \`status\`, \`currency\`, \`created_at\`, \`updated_at\`)
     VALUES (?, 'MARKETPLACE', 9001, 9001, 9001, 'Kitchen mixer tap leaking at the base.',
             'Randburg', ?, 'ZAR', NOW(), NOW())`,
    [reference, status],
  );
  const jobId = String(result.insertId);
  await pool.query(
    `INSERT INTO job_assignments
       (\`job_id\`, \`assignment_type\`, \`professional_id\`, \`assigned_at\`)
     VALUES (?, 'PROFESSIONAL', 9001, NOW())`,
    [jobId],
  );
  return jobId;
}

/**
 * `describe(name, { skip })` is evaluated when a suite is REGISTERED, which
 * happens before any `before` hook runs — so a flag set inside `before` would
 * still read as "unavailable" and skip everything. Skipping from inside each
 * test body avoids that ordering trap.
 *
 * Top-level `await` would be the obvious alternative, but this package
 * compiles to CommonJS via tsx, where it is a transform error.
 */
function whenMySql(name: string, fn: () => Promise<void>): void {
  it(name, async (t) => {
    if (!schemaReady) {
      t.skip('no MySQL server — run `npm run test:mysql` to require these');
      return;
    }
    await fn();
  });
}

describe('MySQL: soft delete is invisible to every read path', () => {
  whenMySql('getJobById returns null once the job is soft-deleted', async () => {
    const jobId = await seedJob();
    assert.ok(await store.getJobById(jobId), 'precondition: readable before delete');

    await store.deleteJob(jobId);

    // The assertion that was failing before the fix: the detail read had no
    // `deleted_at` filter and kept serving a request the customer withdrew.
    assert.equal(await store.getJobById(jobId), null, 'a deleted job must read as absent');
  });

  whenMySql('the customer list drops the job and decrements the total', async () => {
    const before = await store.listJobsByCustomerId('9001', 1, 50);
    const jobId = await seedJob();
    const added = await store.listJobsByCustomerId('9001', 1, 50);
    assert.equal(added.total, before.total + 1, 'precondition: the new job is listed');

    await store.deleteJob(jobId);

    const after = await store.listJobsByCustomerId('9001', 1, 50);
    assert.equal(after.total, before.total, 'total must exclude the deleted job');
    assert.ok(
      !after.items.some((job) => job.id === jobId),
      'a deleted job must not appear in the customer list',
    );
  });

  whenMySql('the row itself survives, so quotes and history stay auditable', async () => {
    const jobId = await seedJob();
    await store.deleteJob(jobId);
    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
      'SELECT `deleted_at`, `status` FROM `jobs` WHERE `id` = ?',
      [jobId],
    );
    assert.equal(rows.length, 1, 'the row must NOT be hard-deleted');
    assert.ok(rows[0]?.['deleted_at'] !== null, 'deleted_at must be stamped');
    assert.equal(rows[0]?.['status'], 'REQUESTED', 'a delete is not a status transition');
  });

  whenMySql('is idempotent: a second delete changes nothing and does not throw', async () => {
    const jobId = await seedJob();
    await store.deleteJob(jobId);
    await assert.doesNotReject(() => store.deleteJob(jobId));
    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
      'SELECT `deleted_at` FROM `jobs` WHERE `id` = ?',
      [jobId],
    );
    assert.ok(rows[0]?.['deleted_at'] !== null);
  });

  whenMySql('writes NO job_status_history row, because a delete is not a transition', async () => {
    const jobId = await seedJob();
    await store.deleteJob(jobId);
    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS `n` FROM `job_status_history` WHERE `job_id` = ?',
      [jobId],
    );
    assert.equal(Number(rows[0]?.['n']), 0);
  });
});

describe('MySQL: a withdrawn request cannot be quoted', () => {
  whenMySql('refuses a quote when the job is deleted between the read and the write', async () => {
    const jobId = await seedJob();

    // The service loads the job first, so the realistic race is: read the job,
    // the customer withdraws it, then the professional's quote lands. The
    // `deleted_at IS NULL ... FOR UPDATE` guard inside the store is what stops
    // that, and this is the only way to reach it from a test.
    const loaded = await store.getJobById(jobId);
    assert.ok(loaded !== null, 'precondition: the job is readable before the delete');
    await store.deleteJob(jobId);

    await assert.rejects(
      () =>
        quotesStore.createQuote({
          job: loaded,
          providerType: 'professional',
          providerNumericId: '9001',
          providerName: 'Test Pro',
          createdBy: '9002',
          input: {
            total: 500,
            currency: 'ZAR',
            message: 'Happy to help.',
            items: [{ description: 'Labour', quantity: 1, unitPrice: 500 }],
          },
        }),
      (error: Error) => {
        assert.match(
          error.message,
          /not addressed|not found|not quoteable/i,
          `expected the store to refuse, got: ${error.message}`,
        );
        return true;
      },
    );

    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
      'SELECT COUNT(*) AS `n` FROM `quotes` WHERE `job_id` = ?',
      [jobId],
    );
    assert.equal(Number(rows[0]?.['n']), 0, 'no quote row may exist for a deleted job');
  });

  whenMySql('a withdrawn request is no longer returned by getJobById, so the service 404s first', async () => {
    const jobId = await seedJob();
    assert.ok(await store.getJobById(jobId), 'precondition: readable before the delete');
    await store.deleteJob(jobId);
    assert.equal(await store.getJobById(jobId), null);
  });
});

describe('MySQL: edit and cancel write what they claim to', () => {
  whenMySql('updateJob writes only the supplied keys', async () => {
    const jobId = await seedJob();
    await pool!.query(`UPDATE jobs SET \`scheduled_at\` = '2026-10-05 09:00:00' WHERE \`id\` = ?`, [
      jobId,
    ]);

    const updated = await store.updateJob({
      jobId,
      patch: { description: 'Kitchen mixer tap replaced and the floor dried out properly.' },
    });

    assert.equal(updated.description, 'Kitchen mixer tap replaced and the floor dried out properly.');
    assert.equal(updated.location, 'Randburg', 'an unsupplied key must be untouched');
    assert.ok(updated.scheduledAt !== null, 'scheduled_at must be untouched');
  });

  whenMySql('updateJob clears a preference when scheduledAt is explicitly null', async () => {
    const jobId = await seedJob();
    await pool!.query(`UPDATE jobs SET \`scheduled_at\` = '2026-10-05 09:00:00' WHERE \`id\` = ?`, [
      jobId,
    ]);

    const updated = await store.updateJob({ jobId, patch: { scheduledAt: null } });

    assert.equal(updated.scheduledAt, null);
    assert.equal(updated.preferredDate, null);
  });

  whenMySql('cancelJob writes CANCELLED and records the transition', async () => {
    const jobId = await seedJob();
    const cancelled = await store.cancelJob(jobId, '9001');
    assert.equal(cancelled.status, 'CANCELLED');

    const [rows] = await pool!.query<mysql.RowDataPacket[]>(
      'SELECT `previous_status`, `new_status` FROM `job_status_history` WHERE `job_id` = ?',
      [jobId],
    );
    assert.equal(rows.length, 1, 'exactly one history row');
    assert.equal(rows[0]?.['previous_status'], 'REQUESTED');
    assert.equal(rows[0]?.['new_status'], 'CANCELLED');
  });

  whenMySql('the gate holds: an ACCEPTED job refuses both edit and cancel', async () => {
    const jobId = await seedJob('ACCEPTED');

    await assert.rejects(
      () => store.updateJob({ jobId, patch: { location: 'Somewhere else' } }),
      /ACCEPTED|no longer|not be (edited|changed|cancelled)/i,
      'an accepted job must refuse an edit',
    );
    await assert.rejects(
      () => store.cancelJob(jobId, '9001'),
      /ACCEPTED|no longer|not be (edited|changed|cancelled)/i,
      'an accepted job must refuse a cancel',
    );
  });
});

let schemaReady = false;

before(async () => {
  try {
    schemaReady = await setUpDatabase();
    if (schemaReady) await seedFixtures();
  } catch (error) {
    // Tear down before rethrowing: a leaked pool keeps the event loop alive
    // and the process hangs instead of reporting the failure.
    await tearDown();
    throw error;
  }
});

after(async () => {
  await tearDown();
});

async function tearDown(): Promise<void> {
  if (pool !== null) {
    await pool.end().catch(() => undefined);
    pool = null;
  }
  if (admin !== null && scratchDb !== null) {
    await admin.query(`DROP DATABASE IF EXISTS \`${scratchDb}\``).catch(() => undefined);
  }
  if (admin !== null) {
    await admin.end().catch(() => undefined);
    admin = null;
  }
}
