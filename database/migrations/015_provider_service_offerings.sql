-- Fixlynk migration 015 — Provider-authored service offerings
--
-- Adds: service_offerings, jobs.service_offering_id
--
-- Why this is a separate table and not rows in `services`:
--
-- `services` is the platform catalogue and stays ADMIN-owned. It cannot host
-- provider-authored entries because both of its uniqueness constraints are
-- global rather than per-provider:
--
--   UNIQUE KEY uq_services_slug             (slug)
--   UNIQUE KEY uq_services_category_name   (category_id, name)
--
-- So two plumbers who both want to offer "Leak Repair" cannot both exist as
-- rows in `services` — the second INSERT fails with ER_DUP_ENTRY on both the
-- name and the slug. The platform catalogue already contains
-- 'Leak Repair & Pipe Fixes' / 'leak-repair' (seeders/001_reference_data.sql),
-- so the collision is the common case, not an edge case.
--
-- A `service_offerings` row is therefore the provider-authored thing: a
-- provider names their own service, places it in an existing platform
-- `service_categories` bucket, and attaches an indicative price. Categories
-- stay platform-owned because marketplace browsing and filtering join through
-- them; only the leaf service is provider-authored.
--
--   provider_type  derived from which owner column is set
--   category_id    FK to the platform-owned taxonomy
--   price_amount   INDICATIVE starting price only. The MVP does not process
--                  payments (AGENTS.md section 12); payment is arranged
--                  directly between the customer and the provider, and the
--                  platform records the agreed quote. This figure is shown to
--                  customers as a starting-from price and is never charged,
--                  never enforced against a submitted quote, and never
--                  treated as an agreed amount.
--
-- Uniqueness is per-owner: (professional_id, name) and (business_id, name).
-- MySQL permits repeated NULLs in a unique index, so the unset owner column
-- never collides and each owner's names stay unique among their own rows.
--
-- Removal is a soft delete (deleted_at) plus is_active = 0, never a hard
-- delete, because closed jobs keep a historical reference here. The backend
-- refuses deactivation while a non-terminal job still references the offering.
--
-- Ownership follows the existing convention used by customer_profiles and
-- service_areas: nullable professional_id / business_id with real foreign
-- keys, and the exactly-one-owner rule enforced by backend services.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `service_offerings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `category_id` BIGINT UNSIGNED NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `description` VARCHAR(500) NULL,
  `price_amount` DECIMAL(10,2) NOT NULL COMMENT 'Indicative starting price in ZAR. Informational only; never charged by the platform.',
  `currency` CHAR(3) NOT NULL DEFAULT 'ZAR',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_offerings_professional_name` (`professional_id`,`name`),
  UNIQUE KEY `uq_service_offerings_business_name` (`business_id`,`name`),
  KEY `idx_service_offerings_category` (`category_id`),
  KEY `idx_service_offerings_active` (`is_active`,`deleted_at`),
  -- Non-negative money is enforced at the column, matching the existing
  -- chk_jobs_agreed_amount / chk_quote_items_money convention.
  CONSTRAINT `chk_service_offerings_price` CHECK ((`price_amount` >= 0)),
  -- Exactly-one-owner rule enforced by backend services (see note above).
  CONSTRAINT `fk_service_offerings_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_service_offerings_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_service_offerings_category` FOREIGN KEY (`category_id`) REFERENCES `service_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `jobs`
  ADD COLUMN `service_offering_id` BIGINT UNSIGNED NULL COMMENT 'Provider-authored offering chosen instead of a platform catalogue service.' AFTER `service_id`,
  ADD KEY `idx_jobs_service_offering` (`service_offering_id`),
  ADD CONSTRAINT `fk_jobs_service_offering` FOREIGN KEY (`service_offering_id`) REFERENCES `service_offerings` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- +migrate Down
ALTER TABLE `jobs`
  DROP FOREIGN KEY `fk_jobs_service_offering`,
  DROP KEY `idx_jobs_service_offering`,
  DROP COLUMN `service_offering_id`;

DROP TABLE IF EXISTS `service_offerings`;