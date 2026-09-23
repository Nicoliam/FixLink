-- FixLink migration 007 — Portfolio, certificates, verification
-- Verification documents are PRIVATE: only storage references are kept here;
-- public profiles expose badges derived from verification_status, never files.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `portfolio_projects` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `service_id` BIGINT UNSIGNED NULL,
  `source_job_id` BIGINT UNSIGNED NULL COMMENT 'Completed job this work was published from, if any.',
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `is_published` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_portfolio_professional` (`professional_id`),
  KEY `idx_portfolio_business` (`business_id`),
  KEY `idx_portfolio_service` (`service_id`),
  -- Portfolio owner (professional XOR business) enforced by backend services.
  CONSTRAINT `fk_portfolio_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_source_job` FOREIGN KEY (`source_job_id`) REFERENCES `jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `portfolio_images` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `project_id` BIGINT UNSIGNED NOT NULL,
  `file_reference` VARCHAR(512) NOT NULL,
  `mime_type` VARCHAR(128) NULL,
  `file_size` BIGINT UNSIGNED NULL,
  `kind` ENUM('BEFORE','AFTER','GENERAL') NOT NULL DEFAULT 'GENERAL',
  `sort_order` INT NOT NULL DEFAULT 0,
  `uploaded_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_portfolio_images_project` (`project_id`, `sort_order`),
  CONSTRAINT `fk_portfolio_images_project` FOREIGN KEY (`project_id`) REFERENCES `portfolio_projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_images_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `certificates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(255) NOT NULL,
  `issuing_organisation` VARCHAR(255) NULL,
  `issue_date` DATE NULL,
  `expiry_date` DATE NULL,
  `verification_status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO') NOT NULL DEFAULT 'PENDING',
  `document_reference` VARCHAR(512) NOT NULL COMMENT 'Private storage key; never exposed publicly.',
  `document_mime` VARCHAR(128) NULL,
  `document_size` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_certificates_professional` (`professional_id`),
  KEY `idx_certificates_business` (`business_id`),
  KEY `idx_certificates_status` (`verification_status`),
  -- Certificate owner (professional XOR business) enforced by backend services.
  CONSTRAINT `fk_certificates_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_certificates_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `certificate_verifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `certificate_id` BIGINT UNSIGNED NOT NULL,
  `reviewed_by` BIGINT UNSIGNED NULL COMMENT 'Admin reviewer.',
  `decision` ENUM('APPROVED','REJECTED','NEEDS_INFO') NOT NULL,
  `notes` VARCHAR(1000) NULL,
  `reviewed_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_certificate_verifications_cert` (`certificate_id`, `reviewed_at`),
  CONSTRAINT `fk_certificate_verifications_cert` FOREIGN KEY (`certificate_id`) REFERENCES `certificates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_certificate_verifications_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `verification_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Subject of the verification.',
  `type` ENUM('IDENTITY','CERTIFICATE','BUSINESS') NOT NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO') NOT NULL DEFAULT 'PENDING',
  `details` JSON NULL COMMENT 'Non-sensitive supporting metadata only.',
  `reviewed_by` BIGINT UNSIGNED NULL COMMENT 'Admin reviewer.',
  `reviewed_at` DATETIME NULL,
  `review_notes` VARCHAR(1000) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_verification_requests_user` (`user_id`, `type`, `status`),
  KEY `idx_verification_requests_status` (`status`),
  CONSTRAINT `fk_verification_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_verification_requests_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `identity_verifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'One current record per user; workflow history lives in verification_requests.',
  `verification_request_id` BIGINT UNSIGNED NULL,
  `document_reference` VARCHAR(512) NOT NULL COMMENT 'Private storage key; never exposed publicly.',
  `document_mime` VARCHAR(128) NULL,
  `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME NULL,
  `review_notes` VARCHAR(1000) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_verifications_user` (`user_id`),
  CONSTRAINT `fk_identity_verifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_identity_verifications_request` FOREIGN KEY (`verification_request_id`) REFERENCES `verification_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_identity_verifications_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `identity_verifications`;
DROP TABLE IF EXISTS `verification_requests`;
DROP TABLE IF EXISTS `certificate_verifications`;
DROP TABLE IF EXISTS `certificates`;
DROP TABLE IF EXISTS `portfolio_images`;
DROP TABLE IF EXISTS `portfolio_projects`;
