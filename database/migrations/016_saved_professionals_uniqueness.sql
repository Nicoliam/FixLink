-- Fixlynk migration 016 — Saved professional uniqueness and integrity
--
-- Adds to: saved_professionals (created in migration 008)
--
-- `saved_professionals` already exists and already carries the bookmark data:
--
--   customer_id             FK to customer_profiles — the owning customer
--   saved_professional_id   FK to professional_profiles, or NULL
--   saved_business_id       FK to business_profiles,     or NULL
--
-- This migration does NOT create a second table for the same concept
-- (AGENTS.md section 16). It hardens the table that is already there, so
-- there is exactly one place a customer's bookmarks live.
--
-- Why this migration exists at all:
--
-- Migration 008 left both integrity rules to the backend services, and the
-- duplicate case was genuinely unguarded. "Save this professional" is
-- naturally retried by users and by double-clicks, and the service can only
-- answer 409 if the database actually holds the unique key. Without one, two
-- concurrent saves both pass the service's existence check and both insert.
--
-- Why a plain UNIQUE key does not work:
--
--   UNIQUE (customer_id, saved_professional_id, saved_business_id)
--
-- MySQL treats NULLs as DISTINCT in a unique index. Both saved_professional_id
-- and saved_business_id are nullable — exactly one is set — so for a saved
-- PROFESSIONAL the business half is NULL on every row and never collides.
-- The key would only ever catch duplicate businesses. The NULL-distinct
-- behaviour is the whole problem, not a detail.
--
-- So uniqueness is expressed over COALESCE(..., 0) via VIRTUAL generated
-- columns. 0 is not a valid id because every real key is an AUTO_INCREMENT
-- starting at 1, so an unset half can never collide with a real one, and the
-- unset half becomes a consistent 0 that DOES collide with itself.
--
-- VIRTUAL, not STORED, and that is a hard requirement rather than a
-- preference. MySQL refuses a foreign key on any column that is the base of a
-- STORED generated column ("Cannot add foreign key constraint"). Both owner
-- columns here already carry ON DELETE CASCADE, so their referential actions
-- are not negotiable and the generated columns cannot be STORED. VIRTUAL
-- columns are computed on read, which MySQL permits alongside a foreign key,
-- and they can still be indexed, so the unique key behaves as intended.
--
-- The same restriction applies to CHECK constraints: a base column cannot
-- appear in both a CHECK constraint and a foreign key carrying a referential
-- action. So the exactly-one-owner rule is written against the generated keys
-- too. Migration 008 documented this rule as backend-enforced; enforcing it
-- at the column as well means a programming error cannot persist a row that
-- is saved to nobody or to both a professional and a business at once.
--
-- The owner is customer_profiles.id, not users.id, which is what migration 008
-- chose and what the customer journey means: a bookmark belongs to the
-- customer's profile. The backend resolves that profile from the session, so
-- the client never supplies it.

-- +migrate Up

-- Defensive de-duplication. Fresh environments have nothing to remove; an
-- environment that already ran the unguarded service could hold repeats, and
-- adding the unique key below would otherwise fail outright. Keep the oldest
-- row of each group, since it is the one whose created_at reflects when the
-- customer actually saved the professional.
DELETE `a` FROM `saved_professionals` `a`
  INNER JOIN `saved_professionals` `b`
    ON a.`customer_id` = b.`customer_id`
   AND COALESCE(a.`saved_professional_id`, 0) = COALESCE(b.`saved_professional_id`, 0)
   AND COALESCE(a.`saved_business_id`, 0) = COALESCE(b.`saved_business_id`, 0)
   AND a.`id` > b.`id`;

-- No extra index is added on saved_professional_id / saved_business_id.
-- Migration 008 already indexes both columns to support its foreign keys, and
-- adding a second index over the same column is redundant: MySQL then binds
-- the foreign key to whichever index it picks, which makes the duplicate
-- undroppable ("Cannot drop index ... needed in a foreign key constraint").
-- That breaks the Down migration, so this one adds only the unique key and the
-- check, both of which the table genuinely lacks.

ALTER TABLE `saved_professionals`
  ADD COLUMN `professional_key` BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(`saved_professional_id`, 0)) VIRTUAL,
  ADD COLUMN `business_key` BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(`saved_business_id`, 0)) VIRTUAL,
  ADD UNIQUE KEY `uq_saved_professionals_unique` (`customer_id`,`professional_key`,`business_key`),
  ADD CONSTRAINT `chk_saved_professionals_owner` CHECK (
    (`professional_key` > 0 AND `business_key` = 0)
    OR (`business_key` > 0 AND `professional_key` = 0)
  );

-- +migrate Down
ALTER TABLE `saved_professionals`
  DROP CHECK `chk_saved_professionals_owner`,
  DROP KEY `uq_saved_professionals_unique`,
  DROP COLUMN `business_key`,
  DROP COLUMN `professional_key`;
