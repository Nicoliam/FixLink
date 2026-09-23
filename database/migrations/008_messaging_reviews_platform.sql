-- FixLink migration 008 — Messaging, reviews, notifications, saved providers,
-- reports, disputes, audit logs.
--
-- Messaging read model (MVP simplification): messages.read_at records when a
-- message was first read. Per-participant read receipts may be added later
-- without breaking this table (see docs/DATABASE.md section 40).

-- +migrate Up
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NULL COMMENT 'Job this conversation relates to, if any.',
  `subject` VARCHAR(255) NULL,
  `created_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversations_job` (`job_id`),
  CONSTRAINT `fk_conversations_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `conversation_participants` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `joined_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conversation_participants` (`conversation_id`, `user_id`),
  KEY `idx_conversation_participants_user` (`user_id`),
  CONSTRAINT `fk_conversation_participants_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_conversation_participants_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `conversation_id` BIGINT UNSIGNED NOT NULL,
  `sender_id` BIGINT UNSIGNED NULL,
  `body` TEXT NOT NULL,
  `read_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation` (`conversation_id`, `created_at`),
  CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `message_attachments` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `message_id` BIGINT UNSIGNED NOT NULL,
  `file_reference` VARCHAR(512) NOT NULL,
  `mime_type` VARCHAR(128) NULL,
  `file_size` BIGINT UNSIGNED NULL,
  `uploaded_by` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_message_attachments_message` (`message_id`),
  CONSTRAINT `fk_message_attachments_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_message_attachments_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reviews` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL COMMENT 'One review per job.',
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `rating` TINYINT UNSIGNED NOT NULL,
  `comment` TEXT NULL,
  `is_visible` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reviews_job` (`job_id`),
  KEY `idx_reviews_professional` (`professional_id`),
  KEY `idx_reviews_business` (`business_id`),
  KEY `idx_reviews_customer` (`customer_id`),
  CONSTRAINT `chk_reviews_rating` CHECK (`rating` >= 1 AND `rating` <= 5),
  -- Review target (professional XOR business) enforced by backend services.
  CONSTRAINT `fk_reviews_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `review_responses` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `review_id` BIGINT UNSIGNED NOT NULL COMMENT 'One response per review.',
  `responder_id` BIGINT UNSIGNED NULL,
  `response` TEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_review_responses_review` (`review_id`),
  CONSTRAINT `fk_review_responses_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_review_responses_responder` FOREIGN KEY (`responder_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(64) NOT NULL COMMENT 'e.g. QUOTE_RECEIVED, JOB_ASSIGNED, PARTS_REQUESTED.',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NULL,
  `reference_type` VARCHAR(64) NULL COMMENT 'e.g. JOB, QUOTE, PARTS_REQUEST.',
  `reference_id` BIGINT UNSIGNED NULL,
  `read_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read` (`user_id`, `read_at`, `created_at`),
  KEY `idx_notifications_type` (`type`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saved_professionals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `customer_id` BIGINT UNSIGNED NOT NULL,
  `saved_professional_id` BIGINT UNSIGNED NULL,
  `saved_business_id` BIGINT UNSIGNED NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_saved_professionals_customer` (`customer_id`),
  -- Save target (professional XOR business) enforced by backend services.
  CONSTRAINT `fk_saved_professionals_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_professionals_professional` FOREIGN KEY (`saved_professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_professionals_business` FOREIGN KEY (`saved_business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `reporter_id` BIGINT UNSIGNED NULL,
  `report_type` ENUM('PROVIDER','REVIEW','JOB','USER','CONTENT') NOT NULL,
  `entity_type` VARCHAR(64) NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(500) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('OPEN','IN_REVIEW','RESOLVED','DISMISSED') NOT NULL DEFAULT 'OPEN',
  `resolved_by` BIGINT UNSIGNED NULL,
  `resolved_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_type` (`report_type`),
  CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_reports_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `disputes` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_id` BIGINT UNSIGNED NOT NULL,
  `opened_by` BIGINT UNSIGNED NULL,
  `reason` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `status` ENUM('OPEN','IN_REVIEW','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN',
  `resolution` TEXT NULL,
  `resolved_by` BIGINT UNSIGNED NULL,
  `resolved_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_disputes_job` (`job_id`),
  KEY `idx_disputes_status` (`status`),
  CONSTRAINT `fk_disputes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_disputes_opened_by` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_disputes_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `actor_id` BIGINT UNSIGNED NULL,
  `action` VARCHAR(128) NOT NULL COMMENT 'e.g. VERIFICATION_APPROVED, USER_SUSPENDED.',
  `entity_type` VARCHAR(64) NULL,
  `entity_id` BIGINT UNSIGNED NULL,
  `metadata` JSON NULL,
  `ip_address` VARCHAR(45) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_actor` (`actor_id`),
  KEY `idx_audit_logs_entity` (`entity_type`, `entity_id`),
  KEY `idx_audit_logs_created` (`created_at`),
  CONSTRAINT `fk_audit_logs_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Immutable; no updated_at by design.';

-- +migrate Down
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `disputes`;
DROP TABLE IF EXISTS `reports`;
DROP TABLE IF EXISTS `saved_professionals`;
DROP TABLE IF EXISTS `notifications`;
DROP TABLE IF EXISTS `review_responses`;
DROP TABLE IF EXISTS `reviews`;
DROP TABLE IF EXISTS `message_attachments`;
DROP TABLE IF EXISTS `messages`;
DROP TABLE IF EXISTS `conversation_participants`;
DROP TABLE IF EXISTS `conversations`;
