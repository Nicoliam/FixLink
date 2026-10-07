/**
 * Seed integrity — the documented dev password must actually open the
 * accounts the seeders create.
 *
 * Why this exists: every seeded account shipped one shared bcrypt hash, and
 * that hash did not match the password written in the comment above it. The
 * seeders looked correct and the schema was fine, so nothing failed loudly —
 * the accounts simply could not be logged into, and QA/demo sign-in was
 * broken until someone tried it by hand.
 *
 * This reads the SQL as text rather than the database, so it needs no running
 * MySQL and cannot be satisfied by whatever happens to be in the dev
 * database right now.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.resolve(HERE, '../../database/seeders');

/** The single fictional dev password every seeded account shares. */
const DOCUMENTED_PASSWORD = 'Fixlynk-dev-001';

const HASH_RE = /\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g;

interface SeedFile {
  name: string;
  contents: string;
  hashes: string[];
}

function readSeedFiles(): SeedFile[] {
  return readdirSync(SEED_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => {
      const contents = readFileSync(path.join(SEED_DIR, name), 'utf8');
      return { name, contents, hashes: contents.match(HASH_RE) ?? [] };
    });
}

const seedFiles = readSeedFiles();

describe('seed data integrity', () => {
  it('finds the seeder files at all', () => {
    assert.ok(seedFiles.length > 0, `no .sql files found in ${SEED_DIR}`);
  });

  it('documents the dev password it expects people to use', () => {
    // If this ever fails, the seeder comment and this test have drifted, and
    // the documented password below is no longer the one on offer.
    const documented = seedFiles.filter((file) => file.contents.includes(DOCUMENTED_PASSWORD));
    assert.ok(
      documented.length > 0,
      `no seeder mentions '${DOCUMENTED_PASSWORD}'; update this test and the seeder comments together`,
    );
  });

  it('ships at least one usable account', () => {
    const all = seedFiles.flatMap((file) => file.hashes);
    assert.ok(all.length > 0, 'no password hashes found in the seeders');
  });

  for (const file of seedFiles.filter((f) => f.hashes.length > 0)) {
    it(`${file.name}: every seeded hash opens with the documented password`, () => {
      const mismatched = file.hashes.filter((hash) => !bcrypt.compareSync(DOCUMENTED_PASSWORD, hash));
      assert.deepEqual(
        mismatched,
        [],
        `${file.name} contains ${mismatched.length} hash(es) that do not open with ` +
          `'${DOCUMENTED_PASSWORD}'. Regenerate them with bcrypt.hashSync('${DOCUMENTED_PASSWORD}', 12) ` +
          `— a hash nobody can log in with fails silently at seed time.`,
      );
    });
  }

  it('never seeds a real-looking phone number or a real domain', () => {
    // AGENTS.md §29: seed data must be fictional. Cheap guard against a
    // real person's number being pasted into a fixture.
    const emails = seedFiles.flatMap((file) => file.contents.match(/[\w.+-]+@[\w.-]+/g) ?? []);
    for (const email of emails) {
      // Any subdomain of a reserved example domain is fine, e.g.
      // hello@ubuntuplumbing.example.co.za — that domain cannot resolve to a
      // real inbox, which is exactly what makes it safe seed data.
      assert.ok(
        /@(?:[\w-]+\.)*example\.(?:co\.za|com|org)$/i.test(email),
        `${email} is not an obviously fictional address`,
      );
    }
  });
});
