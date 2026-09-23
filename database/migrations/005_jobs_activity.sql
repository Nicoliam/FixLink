-- FixLink migration 005 — Job activity (job_images, job_updates, job_voice_notes)
-- File/audio binaries are NEVER stored in MySQL; only references + metadata.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `job_images` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `uploader_id` BIGINT UNSIGNED NULL,
  `phase` ENUM('BEFORE','DURING','AFTER') NOT NULL,
  `file_reference` VARCHAR(512) NOT NULL COMMENT 'External storage key.',
  `mime_type` VARCHAR(128) NULL,
  `file_size` BIGINT UNSIGNED NULL COMMENT 'Bytes.',
  `caption` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_images_job_phase` (`job_id`, `phase`),
  KEY `idx_job_images_uploader` (`uploader_id`),
  CONSTRAINT `fk_job_images_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_images_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_updates` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `author_id` BIGINT UNSIGNED NULL,
  `message` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_updates_job` (`job_id`, `created_at`),
  CONSTRAINT `fk_job_updates_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_updates_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `job_voice_notes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `author_id` BIGINT UNSIGNED NULL,
  `file_reference` VARCHAR(512) NOT NULL COMMENT 'External storage key for the audio file.',
  `mime_type` VARCHAR(128) NULL,
  `file_size` BIGINT UNSIGNED NULL COMMENT 'Bytes.',
  `duration_seconds` INT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_voice_notes_job` (`job_id`),
  CONSTRAINT `fk_job_voice_notes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_voice_notes_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `job_voice_notes`;
DROP TABLE IF EXISTS `job_updates`;
DROP TABLE IF EXISTS `job_images`;
