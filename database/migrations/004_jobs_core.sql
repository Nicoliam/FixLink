-- FixLink migration 004 — Jobs core (jobs, job_assignments, job_status_history)
-- There is exactly ONE jobs table. Source distinguishes MARKETPLACE / INTERNAL.
-- Status transitions are validated by the backend; every transition is
-- appended to job_status_history (never overwritten). Assignments are
-- historised in job_assignments via assigned_at / unassigned_at.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `jobs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reference` VARCHAR(32) NOT NULL COMMENT 'Human-friendly reference, e.g. FL-2026-000123. Generated app-side.',
  `source` ENUM('MARKETPLACE','INTERNAL') NOT NULL,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `service_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(255) NULL,
  `description` TEXT NOT NULL,
  `address_line1` VARCHAR(255) NULL,
  `city` VARCHAR(128) NULL,
  `province` VARCHAR(128) NULL,
  `postal_code` VARCHAR(16) NULL,
  `latitude` DECIMAL(10,7) NULL,
  `longitude` DECIMAL(10,7) NULL,
  `priority` ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  `scheduled_at` DATETIME NULL,
  `status` ENUM('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') NOT NULL DEFAULT 'REQUESTED',
  `agreed_amount` DECIMAL(12,2) NULL COMMENT 'Agreed quote amount (recorded only; no payment processing in MVP).',
  `currency` CHAR(3) NOT NULL DEFAULT 'ZAR',
  `created_by` BIGINT UNSIGNED NULL,
  `completed_at` DATETIME NULL,
  `confirmed_at` DATETIME NULL,
  `closed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jobs_reference` (`reference`),
  KEY `idx_jobs_status` (`status`),
  KEY `idx_jobs_customer` (`customer_id`),
  KEY `idx_jobs_professional` (`professional_id`),
  KEY `idx_jobs_business` (`business_id`),
  KEY `idx_jobs_service` (`service_id`),
  KEY `idx_jobs_scheduled` (`scheduled_at`),
  KEY `idx_jobs_created` (`created_at`),
  CONSTRAINT `chk_jobs_agreed_amount` CHECK (`agreed_amount` IS NULL OR `agreed_amount` >= 0),
  CONSTRAINT `fk_jobs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_assignments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `assignment_type` ENUM('PROFESSIONAL','BUSINESS','TECHNICIAN') NOT NULL,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `technician_id` BIGINT UNSIGNED NULL,
  `assigned_by` BIGINT UNSIGNED NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unassigned_at` DATETIME NULL COMMENT 'Set on reassignment; NULL means currently active.',
  `notes` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_assignments_job` (`job_id`),
  KEY `idx_job_assignments_active` (`job_id`, `unassigned_at`),
  KEY `idx_job_assignments_technician` (`technician_id`, `unassigned_at`),
  -- assignment_type/target consistency enforced by backend services:
  -- PROFESSIONAL->professional_id, BUSINESS->business_id, TECHNICIAN->technician_id.
  CONSTRAINT `fk_job_assignments_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_technician` FOREIGN KEY (`technician_id`) REFERENCES `technicians` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_status_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `previous_status` ENUM('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') NULL,
  `new_status` ENUM('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') NOT NULL,
  `changed_by` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_status_history_job` (`job_id`, `created_at`),
  CONSTRAINT `fk_job_status_history_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_status_history_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `job_status_history`;
DROP TABLE IF EXISTS `job_assignments`;
DROP TABLE IF EXISTS `jobs`;
