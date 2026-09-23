-- FixLink migration 006 — Quotes, parts, approvals
-- MVP records agreed amounts in ZAR only; no payment processing tables.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `quotes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `total` DECIMAL(12,2) NOT NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'ZAR',
  `description` TEXT NULL,
  `status` ENUM('DRAFT','SUBMITTED','ACCEPTED','DECLINED','WITHDRAWN','EXPIRED') NOT NULL DEFAULT 'DRAFT',
  `valid_until` DATETIME NULL,
  `submitted_at` DATETIME NULL,
  `accepted_at` DATETIME NULL,
  `declined_at` DATETIME NULL,
  `withdrawn_at` DATETIME NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quotes_job` (`job_id`),
  KEY `idx_quotes_status` (`status`),
  KEY `idx_quotes_professional` (`professional_id`),
  KEY `idx_quotes_business` (`business_id`),
  CONSTRAINT `chk_quotes_total` CHECK (`total` >= 0),
  -- Quote owner (professional XOR business) enforced by backend services.
  CONSTRAINT `fk_quotes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `quote_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `quote_id` BIGINT UNSIGNED NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `quantity` DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  `unit_price` DECIMAL(12,2) NOT NULL,
  `total` DECIMAL(12,2) GENERATED ALWAYS AS (`quantity` * `unit_price`) STORED COMMENT 'Derived; never trusted from client input.',
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote_items_quote` (`quote_id`),
  CONSTRAINT `chk_quote_items_money` CHECK (`quantity` > 0 AND `unit_price` >= 0),
  CONSTRAINT `fk_quote_items_quote` FOREIGN KEY (`quote_id`) REFERENCES `quotes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parts_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `requester_id` BIGINT UNSIGNED NULL COMMENT 'Technician/provider requesting parts.',
  `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO','CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reason` TEXT NOT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL COMMENT 'Manager/owner; must differ from requester (enforced by backend).',
  `reviewed_at` DATETIME NULL,
  `review_notes` VARCHAR(500) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parts_requests_job` (`job_id`),
  KEY `idx_parts_requests_status` (`status`),
  KEY `idx_parts_requests_requester` (`requester_id`),
  CONSTRAINT `fk_parts_requests_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_parts_requests_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_parts_requests_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `parts_request_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parts_request_id` BIGINT UNSIGNED NOT NULL,
  `part_name` VARCHAR(255) NOT NULL,
  `quantity` INT UNSIGNED NOT NULL DEFAULT 1,
  `notes` VARCHAR(500) NULL,
  `photo_reference` VARCHAR(512) NULL COMMENT 'External storage key; never binary.',
  `photo_mime` VARCHAR(128) NULL,
  `photo_size` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parts_request_items_request` (`parts_request_id`),
  CONSTRAINT `chk_parts_request_items_qty` CHECK (`quantity` > 0),
  CONSTRAINT `fk_parts_request_items_request` FOREIGN KEY (`parts_request_id`) REFERENCES `parts_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_approvals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `request_type` ENUM('PARTS','STATUS_CHANGE','COMPLETION','OTHER') NOT NULL,
  `parts_request_id` BIGINT UNSIGNED NULL,
  `requested_by` BIGINT UNSIGNED NULL,
  `reviewed_by` BIGINT UNSIGNED NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO') NOT NULL DEFAULT 'PENDING',
  `comments` VARCHAR(1000) NULL,
  `requested_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_approvals_job` (`job_id`),
  KEY `idx_job_approvals_status` (`status`),
  CONSTRAINT `fk_job_approvals_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_parts_request` FOREIGN KEY (`parts_request_id`) REFERENCES `parts_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `job_approvals`;
DROP TABLE IF EXISTS `parts_request_items`;
DROP TABLE IF EXISTS `parts_requests`;
DROP TABLE IF EXISTS `quote_items`;
DROP TABLE IF EXISTS `quotes`;
