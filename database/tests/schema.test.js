'use strict';

/**
 * Fixlynk Stage 4 — Database foundation tests.
 * Run: npm test (from database/) with DB_* env vars pointing at MySQL.
 * Read-only except for constraint checks, which run inside rolled-back
 * transactions and leave no residue.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const fs = require('node:fs');
const path = require('node:path');
const { getConfig } = require('../db');

const EXPECTED_TABLES = [
  'users', 'roles', 'user_roles',
  'customer_profiles',
  'professional_profiles', 'professional_services',
  'business_profiles', 'business_members',
  'technicians',
  'service_categories', 'services', 'service_areas', 'business_services',
  'service_offerings',
  'portfolio_projects', 'portfolio_images',
  'certificates', 'certificate_verifications',
  'verification_requests', 'identity_verifications',
  'jobs', 'job_assignments', 'job_images', 'job_updates',
  'job_voice_notes', 'job_status_history',
  'quotes', 'quote_items',
  'parts_requests', 'parts_request_items',
  'job_approvals',
  'conversations', 'conversation_participants', 'messages', 'message_attachments',
  'reviews', 'review_responses',
  'notifications',
  'saved_professionals',
  'reports', 'disputes', 'audit_logs',
];

const FORBIDDEN_TABLES = [
  'marketplace_jobs', 'business_jobs', 'technician_jobs',
  'payments', 'payment_transactions', 'escrow',
  'subscriptions', 'plans', 'lead_credits',
];

let db;

async function tables() {
  const [rows] = await db.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()'
  );
  return new Set(rows.map((r) => r.TABLE_NAME));
}

async function enumValues(table, column) {
  const [rows] = await db.query(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  assert.equal(rows.length, 1, `${table}.${column} must exist`);
  const m = rows[0].COLUMN_TYPE.match(/^enum\((.*)\)$/i);
  assert.ok(m, `${table}.${column} must be ENUM`);
  return m[1].split(',').map((s) => s.trim().replace(/^'(.*)'$/, '$1'));
}

before(async () => {
  db = await mysql.createConnection({ ...getConfig(), multipleStatements: false });
});

after(async () => {
  if (db) await db.end();
});

describe('schema presence', () => {
  it('creates all 42 domain tables', async () => {
    const found = await tables();
    for (const t of EXPECTED_TABLES) assert.ok(found.has(t), `missing table: ${t}`);
  });

  it('persists refresh sessions as hashed metadata only', async () => {
    const found = await tables();
    assert.ok(found.has('refresh_tokens'));
    const [rows] = await db.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'refresh_tokens'`
    );
    const names = new Set(rows.map((row) => row.COLUMN_NAME));
    assert.ok(names.has('token_hash'));
    assert.ok(names.has('revoked_at'));
    assert.ok(!names.has('token'));
  });

  it('does NOT create split job tables or out-of-scope tables', async () => {
    const found = await tables();
    for (const t of FORBIDDEN_TABLES) assert.ok(!found.has(t), `forbidden table exists: ${t}`);
  });

  it('has exactly ONE jobs table', async () => {
    const found = await tables();
    const jobTables = [...found].filter((t) => t === 'jobs' || t.endsWith('_jobs'));
    assert.deepEqual(jobTables, ['jobs']);
  });

  it('tracks every migration file as applied', async () => {
    const files = fs.readdirSync(path.join(__dirname, '../migrations')).filter((file) => file.endsWith('.sql'));
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM `schema_migrations`');
    assert.equal(rows[0].n, files.length);
  });
});

describe('relationships (foreign keys)', () => {
  it('defines foreign keys across the job engine', async () => {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM information_schema.REFERENTIAL_CONSTRAINTS
       WHERE CONSTRAINT_SCHEMA = DATABASE()`
    );
    assert.ok(rows[0].n >= 60, `expected >= 60 FKs, found ${rows[0].n}`);
  });

  it('links jobs to customer, professional, business and service', async () => {
    const [rows] = await db.query(
      `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
         AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    const refs = new Set(rows.map((r) => r.REFERENCED_TABLE_NAME));
    for (const t of ['customer_profiles', 'professional_profiles', 'business_profiles', 'services', 'users']) {
      assert.ok(refs.has(t), `jobs must reference ${t}`);
    }
  });

  it('rejects inserts that violate foreign keys', async () => {
    await assert.rejects(
      db.query("INSERT INTO `jobs` (`reference`, `source`, `customer_id`, `description`) VALUES ('FL-X', 'MARKETPLACE', 999999, 'orphan')"),
      /foreign key/i
    );
  });
});

describe('indexes and unique constraints', () => {
  it('indexes common job lookup paths', async () => {
    const [rows] = await db.query(
      `SELECT INDEX_NAME, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS cols
       FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
       GROUP BY INDEX_NAME`
    );
    const byCol = rows.map((r) => r.cols);
    for (const needed of ['status', 'customer_id', 'business_id', 'professional_id']) {
      assert.ok(byCol.some((c) => c.split(',').includes(needed)), `jobs missing index on ${needed}`);
    }
  });

  it('enforces unique user email', async () => {
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query("INSERT INTO `users` (`email`, `password_hash`) VALUES ('naledi.dlamini@example.co.za', 'x')"),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('enforces one review per job', async () => {
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query('INSERT INTO `reviews` (`job_id`, `customer_id`, `professional_id`, `rating`) VALUES (3, 3, 2, 4)'),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('enforces one role assignment per user+role', async () => {
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query('INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES (2, 1)'),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
});

describe('job lifecycle model', () => {
  it('supports the full documented status lifecycle', async () => {
    const values = await enumValues('jobs', 'status');
    for (const s of ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CONFIRMED', 'CLOSED', 'CANCELLED', 'DISPUTED']) {
      assert.ok(values.includes(s), `jobs.status missing ${s}`);
    }
  });

  it('supports MARKETPLACE and INTERNAL sources', async () => {
    assert.deepEqual(await enumValues('jobs', 'source'), ['MARKETPLACE', 'INTERNAL']);
  });

  it('supports BEFORE/DURING/AFTER job image phases', async () => {
    assert.deepEqual(await enumValues('job_images', 'phase'), ['BEFORE', 'DURING', 'AFTER']);
  });

  it('preserves status history (does not overwrite)', async () => {
    const [rows] = await db.query(
      'SELECT COUNT(*) AS n FROM `job_status_history` WHERE `job_id` = 1'
    );
    assert.ok(rows[0].n >= 5, 'job 1 should have full transition history');
  });

  it('preserves assignment history incl. reassignment', async () => {
    const [rows] = await db.query(
      `SELECT COUNT(*) AS n FROM \`job_assignments\`
       WHERE \`job_id\` = 5 AND \`assignment_type\` = 'TECHNICIAN'`
    );
    assert.equal(rows[0].n, 2);
    const [active] = await db.query(
      `SELECT \`technician_id\` FROM \`job_assignments\`
       WHERE \`job_id\` = 5 AND \`assignment_type\` = 'TECHNICIAN' AND \`unassigned_at\` IS NULL`
    );
    assert.equal(active.length, 1);
    assert.equal(active[0].technician_id, 1);
  });

  it('rejects invalid status values at the database level', async () => {
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query("UPDATE `jobs` SET `status` = 'TELEPORTED' WHERE `id` = 1"),
        /truncat|enum|invalid/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });
});

describe('money, files and privacy rules', () => {
  it('defaults currency to ZAR and records agreed amounts', async () => {
    const [rows] = await db.query('SELECT DISTINCT `currency` FROM `jobs`');
    assert.deepEqual(rows.map((r) => r.currency), ['ZAR']);
    const [amounts] = await db.query('SELECT COUNT(*) AS n FROM `jobs` WHERE `agreed_amount` IS NOT NULL');
    assert.ok(amounts[0].n >= 4);
  });

  it('derives quote item totals (never trusts client math)', async () => {
    const [rows] = await db.query('SELECT `quantity`, `unit_price`, `total` FROM `quote_items`');
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.equal(Number(r.total), Number(r.quantity) * Number(r.unit_price));
    }
  });

  it('stores NO binary columns in file-metadata tables', async () => {
    const [rows] = await db.query(
      `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('job_images','job_voice_notes','portfolio_images','certificates',
           'message_attachments','parts_request_items','identity_verifications',
           'customer_profiles','professional_profiles','business_profiles')
         AND DATA_TYPE IN ('blob','mediumblob','longblob','tinyblob','binary','varbinary')`
    );
    assert.equal(rows.length, 0, `binary columns found: ${JSON.stringify(rows)}`);
  });

  it('never stores plaintext passwords', async () => {
    const [rows] = await db.query('SELECT `password_hash` FROM `users`');
    assert.ok(rows.length > 0);
    for (const r of rows) {
      assert.ok(r.password_hash.length >= 50, 'password_hash suspiciously short');
      assert.ok(!r.password_hash.includes('Fixlynk-dev-001'), 'plaintext password detected');
    }
  });

  it('matches the approval comment contract to its database column', async () => {
    const [rows] = await db.query(
      `SELECT CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parts_requests' AND COLUMN_NAME = 'review_notes'`
    );
    assert.equal(Number(rows[0].CHARACTER_MAXIMUM_LENGTH), 1000);
  });

  it('keeps verification documents as private references only', async () => {
    const [cols] = await db.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'identity_verifications'`
    );
    const names = cols.map((c) => c.COLUMN_NAME);
    assert.ok(names.includes('document_reference'));
    assert.ok(!names.includes('document') && !names.includes('file_data'));
  });
});

describe('seeded relationships', () => {
  it('seeds customers, professionals, businesses and technicians', async () => {
    for (const [table, min] of [
      ['users', 10], ['customer_profiles', 4], ['professional_profiles', 3],
      ['business_profiles', 2], ['business_members', 5], ['technicians', 2],
      ['services', 10], ['service_areas', 5],
    ]) {
      const [rows] = await db.query(`SELECT COUNT(*) AS n FROM \`${table}\``);
      assert.ok(rows[0].n >= min, `${table}: expected >= ${min}, got ${rows[0].n}`);
    }
  });

  it('uses bcrypt-compatible password hashes for seeded users', async () => {
    const [rows] = await db.query('SELECT `password_hash` FROM `users`');
    assert.ok(rows.length > 0);
    for (const row of rows) assert.match(row.password_hash, /^\$2[aby]\$\d{2}\$/);
  });

  it('links a marketplace job across customer, professional and service', async () => {
    const [rows] = await db.query(
      `SELECT j.reference, j.source, j.status, c.first_name, p.display_name, s.name AS service
       FROM jobs j
       JOIN customer_profiles c ON c.id = j.customer_id
       JOIN professional_profiles p ON p.id = j.professional_id
       JOIN services s ON s.id = j.service_id
       WHERE j.id = 1`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'MARKETPLACE');
    assert.equal(rows[0].status, 'IN_PROGRESS');
  });

  it('links an internal job to its business and business-managed customer', async () => {
    const [rows] = await db.query(
      `SELECT j.source, b.business_name, c.first_name, c.user_id
       FROM jobs j
       JOIN business_profiles b ON b.id = j.business_id
       JOIN customer_profiles c ON c.id = j.customer_id
       WHERE j.id = 5`
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, 'INTERNAL');
    assert.equal(rows[0].user_id, null);
  });

  it('keeps business data isolated (no cross-business leakage in seeds)', async () => {
    const [rows] = await db.query(
      `SELECT j.id FROM jobs j WHERE j.business_id = 2`
    );
    assert.equal(rows.length, 0, 'business 2 must own no jobs in seed data');
    const [tech] = await db.query('SELECT COUNT(*) AS n FROM technicians WHERE business_id = 2');
    assert.equal(tech[0].n, 0);
  });

  it('seeds quotes, parts flow, portfolio, certificates and reviews', async () => {
    const [q] = await db.query("SELECT COUNT(*) AS n FROM quotes WHERE status = 'ACCEPTED'");
    assert.ok(q[0].n >= 3);
    const [pr] = await db.query("SELECT status FROM parts_requests WHERE id = 1");
    assert.equal(pr[0].status, 'APPROVED');
    const [pf] = await db.query('SELECT COUNT(*) AS n FROM portfolio_projects WHERE is_published = 1');
    assert.ok(pf[0].n >= 2);
    const [cert] = await db.query("SELECT verification_status FROM certificates WHERE id = 1");
    assert.equal(cert[0].verification_status, 'APPROVED');
    const [rev] = await db.query('SELECT rating FROM reviews WHERE job_id = 3');
    assert.equal(rev[0].rating, 5);
    const [rr] = await db.query('SELECT COUNT(*) AS n FROM review_responses WHERE review_id = 1');
    assert.equal(rr[0].n, 1);
  });

  it('seeds messaging and notifications', async () => {
    const [m] = await db.query('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = 1');
    assert.ok(m[0].n >= 2);
    const [n] = await db.query('SELECT COUNT(*) AS n FROM notifications');
    assert.ok(n[0].n >= 5);
  });
});

describe('saved professionals', () => {
  // Migration 016 hardens the `saved_professionals` table created by migration
  // 008. It adds no new table, so the domain-table count is unchanged; these
  // tests cover the constraints it introduced.
  it('refuses the same professional saved twice by one customer', async () => {
    await db.query('START TRANSACTION');
    try {
      await db.query(
        'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`) VALUES (1, 1)'
      );
      // The duplicate must be refused. MySQL treats NULLs as DISTINCT in a
      // unique index, so without the COALESCE-generated unique key this insert
      // would succeed because saved_business_id is NULL on both rows.
      await assert.rejects(
        db.query(
          'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`) VALUES (1, 1)'
        ),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('refuses the same business saved twice by one customer', async () => {
    await db.query('START TRANSACTION');
    try {
      await db.query(
        'INSERT INTO `saved_professionals` (`customer_id`,`saved_business_id`) VALUES (1, 1)'
      );
      await assert.rejects(
        db.query(
          'INSERT INTO `saved_professionals` (`customer_id`,`saved_business_id`) VALUES (1, 1)'
        ),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('lets different customers save the same professional', async () => {
    await db.query('START TRANSACTION');
    try {
      await db.query(
        'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`) VALUES (1, 2)'
      );
      // Uniqueness is per customer, not global: sharing a shortlist is fine.
      await db.query(
        'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`) VALUES (2, 2)'
      );
      const [rows] = await db.query(
        'SELECT COUNT(*) AS n FROM `saved_professionals` WHERE `saved_professional_id` = 2'
      );
      assert.equal(rows[0].n, 2);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('saves a professional or a business, never both or neither', async () => {
    await db.query('START TRANSACTION');
    try {
      // chk_saved_professionals_owner rejects a half-owned row, so a bookmark
      // can never point at nothing or at two owners at once.
      await assert.rejects(
        db.query(
          'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`,`saved_business_id`) VALUES (3, 1, 1)'
        ),
        /check|constraint/i
      );
      await assert.rejects(
        db.query('INSERT INTO `saved_professionals` (`customer_id`) VALUES (3)'),
        /check|constraint/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('rejects a bookmark for a provider that does not exist', async () => {
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query(
          'INSERT INTO `saved_professionals` (`customer_id`,`saved_professional_id`) VALUES (1, 999999)'
        ),
        /foreign key/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('derives the unique keys with COALESCE over the nullable owner columns', async () => {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME, EXTRA, GENERATION_EXPRESSION
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'saved_professionals'
          AND COLUMN_NAME IN ('professional_key','business_key')`
    );
    assert.equal(rows.length, 2);
    for (const row of rows) {
      // VIRTUAL, not STORED: MySQL refuses a foreign key on a column that is
      // the base of a STORED generated column, and both owner columns here
      // carry ON DELETE CASCADE.
      assert.match(row.EXTRA, /VIRTUAL GENERATED/i, `${row.COLUMN_NAME} must be VIRTUAL`);
      assert.match(row.GENERATION_EXPRESSION, /COALESCE/i);
    }
  });

  it('cascades a deleted provider\'s bookmarks away', async () => {
    const [rows] = await db.query(
      `SELECT CONSTRAINT_NAME, DELETE_RULE
         FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'saved_professionals'`
    );
    const rules = rows.map((r) => r.DELETE_RULE);
    assert.equal(rules.length, 3);
    for (const rule of rules) {
      // customer, professional and business owners all cascade: removing a
      // profile must not leave dangling bookmarks.
      assert.equal(rule, 'CASCADE');
    }
  });
});

describe('provider service offerings', () => {
  it('lets two different providers offer the same service name', async () => {
    // The invariant that forced offerings into their own table: `services`
    // enforces UNIQUE(slug) and UNIQUE(category_id, name) globally, so two
    // providers cannot both author "Leak Repair" as catalogue rows.
    await db.query('START TRANSACTION');
    try {
      await db.query(
        "INSERT INTO `service_offerings` (`professional_id`,`category_id`,`name`,`price_amount`) VALUES (1,1,'Emergency Leak Repair',850.00)"
      );
      await db.query(
        "INSERT INTO `service_offerings` (`professional_id`,`category_id`,`name`,`price_amount`) VALUES (2,1,'Emergency Leak Repair',950.00)"
      );
      // A business owner may hold the same name too: the unset owner column
      // is NULL and MySQL permits repeated NULLs in a unique index.
      await db.query(
        "INSERT INTO `service_offerings` (`business_id`,`category_id`,`name`,`price_amount`) VALUES (1,1,'Emergency Leak Repair',1200.00)"
      );
      const [rows] = await db.query(
        "SELECT COUNT(*) AS n FROM `service_offerings` WHERE `name` = 'Emergency Leak Repair'"
      );
      assert.equal(rows[0].n, 3);
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('rejects the same provider listing a name twice', async () => {
    await db.query('START TRANSACTION');
    try {
      await db.query(
        "INSERT INTO `service_offerings` (`professional_id`,`category_id`,`name`,`price_amount`) VALUES (1,1,'Duplicate Guard',500.00)"
      );
      await assert.rejects(
        db.query(
          "INSERT INTO `service_offerings` (`professional_id`,`category_id`,`name`,`price_amount`) VALUES (1,1,'Duplicate Guard',600.00)"
        ),
        /duplicate/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('keeps the indicative price in ZAR and never negative', async () => {
    const [rows] = await db.query(
      `SELECT COLUMN_NAME, COLUMN_DEFAULT, IS_NULLABLE, NUMERIC_SCALE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_offerings'
         AND COLUMN_NAME IN ('price_amount','currency')`
    );
    assert.equal(rows.length, 2);
    const price = rows.find((r) => r.COLUMN_NAME === 'price_amount');
    const currency = rows.find((r) => r.COLUMN_NAME === 'currency');
// DECIMAL(10,2) with a CHECK constraint, matching chk_jobs_agreed_amount.
      assert.equal(price.IS_NULLABLE, 'NO', 'price_amount must be required');
      assert.equal(Number(price.NUMERIC_SCALE), 2, 'price must hold cents, not rounded Rand');
      assert.equal(price.COLUMN_DEFAULT, null, 'price must not be silently defaulted');
    assert.equal(currency.COLUMN_DEFAULT, 'ZAR');
    await db.query('START TRANSACTION');
    try {
      await assert.rejects(
        db.query(
          "INSERT INTO `service_offerings` (`professional_id`,`category_id`,`name`,`price_amount`) VALUES (1,1,'Negative Price',-1.00)"
        ),
        /check constraint/i
      );
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('lets jobs reference an offering without losing the catalogue service link', async () => {
    const [cols] = await db.query(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
         AND COLUMN_NAME = 'service_offering_id'`
    );
    assert.equal(cols.length, 1);
    assert.equal(cols[0].IS_NULLABLE, 'YES', 'existing jobs must not require an offering');
    const [fks] = await db.query(
      `SELECT REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'jobs'
         AND COLUMN_NAME = 'service_offering_id'`
    );
    assert.equal(fks.length, 1, 'jobs.service_offering_id must be a foreign key');
    assert.equal(fks[0].REFERENCED_TABLE_NAME, 'service_offerings');
    assert.equal(fks[0].REFERENCED_COLUMN_NAME, 'id');
  });

  it('preserves offering history via soft deletion', async () => {
    for (const column of ['created_at', 'updated_at', 'deleted_at', 'is_active']) {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'service_offerings' AND COLUMN_NAME = ?`,
        [column]
      );
      assert.equal(rows[0].n, 1, `service_offerings missing ${column}`);
    }
  });
});

describe('timestamps and soft deletion', () => {
  it('has created_at/updated_at on core tables', async () => {
    const [rows] = await db.query(
      `SELECT TABLE_NAME, GROUP_CONCAT(COLUMN_NAME) AS cols
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('users','jobs','quotes','messages','reviews','business_profiles')
       GROUP BY TABLE_NAME`
    );
    assert.equal(rows.length, 6);
    for (const r of rows) {
      assert.ok(r.cols.includes('created_at'), `${r.TABLE_NAME} missing created_at`);
      assert.ok(r.cols.includes('updated_at'), `${r.TABLE_NAME} missing updated_at`);
    }
  });

  it('supports soft deletion where history must be preserved', async () => {
    for (const t of ['users', 'jobs', 'customer_profiles', 'professional_profiles', 'business_profiles', 'technicians']) {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'deleted_at'`,
        [t]
      );
      assert.equal(rows[0].n, 1, `${t} missing deleted_at`);
    }
  });
});
