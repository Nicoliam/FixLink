-- Fixlynk migration 020 — Provider verification documents and phone/email verification

-- +migrate Up
CREATE TABLE IF NOT EXISTS `verification_documents` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider_id` BIGINT UNSIGNED NOT NULL COMMENT 'Linked to professional_profiles.id.',
  `type` ENUM('HURU_REPORT','ID_COPY','PROOF_OF_RESIDENCE','QUALIFICATION','PROFILE_PICTURE','SELFIE') NOT NULL,
  `original_name` VARCHAR(255) NOT NULL COMMENT 'Original filename as provided by the user.',
  `stored_name` VARCHAR(512) NOT NULL COMMENT 'Opaque server-generated storage key; never a client filename.',
  `mime` VARCHAR(128) NOT NULL COMMENT 'Validated MIME type (pdf/jpg/png only).',
  `size` BIGINT UNSIGNED NOT NULL COMMENT 'File size in bytes.',
  `status` ENUM('uploaded','approved','rejected') NOT NULL DEFAULT 'uploaded',
  `rejection_reason` VARCHAR(500) NULL COMMENT 'Why the document was rejected; null when approved or uploaded.',
  `document_date` DATE NOT NULL COMMENT 'Date on the document (e.g. Huru report issue date).',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_verification_documents_provider` (`provider_id`),
  KEY `idx_verification_documents_type` (`type`),
  KEY `idx_verification_documents_status` (`status`),
  CONSTRAINT `fk_verification_documents_provider` FOREIGN KEY (`provider_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `verification_documents`;