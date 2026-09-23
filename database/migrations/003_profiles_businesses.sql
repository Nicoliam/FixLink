-- FixLink migration 003 — Profiles, businesses, technicians, service links
-- Tables: customer_profiles, professional_profiles, business_profiles,
-- business_members, technicians, professional_services, business_services, service_areas
--
-- Design note (see docs/DATABASE.md section 40): business-managed customers
-- without a login are stored in customer_profiles with user_id NULL and
-- business_id set. Marketplace customers have user_id set.

-- +migrate Up
CREATE TABLE IF NOT EXISTS `customer_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NULL COMMENT 'NULL for business-managed customers without a login.',
  `business_id` BIGINT UNSIGNED NULL COMMENT 'Owning business for internal (non-marketplace) customers.',
  `first_name` VARCHAR(128) NOT NULL,
  `last_name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(32) NULL,
  `profile_photo_reference` VARCHAR(512) NULL COMMENT 'External storage key only; never binary.',
  `profile_photo_mime` VARCHAR(128) NULL,
  `preferred_contact` ENUM('EMAIL','PHONE','WHATSAPP') NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_profiles_user` (`user_id`),
  KEY `idx_customer_profiles_business` (`business_id`),
  KEY `idx_customer_profiles_name` (`last_name`, `first_name`),
  -- Ownership rule (user_id XOR business_id) is enforced by backend services;
  -- MySQL does not allow CHECK constraints on FK-managed columns.
  CONSTRAINT `fk_customer_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `professional_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `display_name` VARCHAR(255) NOT NULL,
  `bio` TEXT NULL,
  `experience_years` INT UNSIGNED NULL,
  `profile_photo_reference` VARCHAR(512) NULL,
  `profile_photo_mime` VARCHAR(128) NULL,
  `verification_status` ENUM('UNVERIFIED','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
  `rating_avg` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `rating_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_professional_profiles_user` (`user_id`),
  KEY `idx_professional_profiles_active` (`is_active`),
  KEY `idx_professional_profiles_rating` (`rating_avg`),
  CONSTRAINT `chk_professional_profiles_rating` CHECK (`rating_avg` >= 0 AND `rating_avg` <= 5),
  CONSTRAINT `fk_professional_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_profiles` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Creating owner; further members live in business_members.',
  `business_name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `logo_reference` VARCHAR(512) NULL,
  `logo_mime` VARCHAR(128) NULL,
  `email` VARCHAR(255) NULL,
  `phone` VARCHAR(32) NULL,
  `address_line1` VARCHAR(255) NULL,
  `city` VARCHAR(128) NULL,
  `province` VARCHAR(128) NULL,
  `postal_code` VARCHAR(16) NULL,
  `verification_status` ENUM('UNVERIFIED','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
  `rating_avg` DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  `rating_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_profiles_slug` (`slug`),
  KEY `idx_business_profiles_owner` (`owner_user_id`),
  KEY `idx_business_profiles_city` (`city`),
  CONSTRAINT `chk_business_profiles_rating` CHECK (`rating_avg` >= 0 AND `rating_avg` <= 5),
  CONSTRAINT `fk_business_profiles_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add business FK for customer_profiles now that business_profiles exists.
ALTER TABLE `customer_profiles`
  ADD CONSTRAINT `fk_customer_profiles_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `business_members` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `role` ENUM('BUSINESS_OWNER','BUSINESS_MANAGER','TECHNICIAN') NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `invited_at` DATETIME NULL,
  `joined_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_members_business_user` (`business_id`, `user_id`),
  KEY `idx_business_members_user` (`user_id`),
  KEY `idx_business_members_role` (`business_id`, `role`),
  CONSTRAINT `fk_business_members_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_business_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `technicians` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL COMMENT 'Technicians are business team members; never auto-professionals.',
  `display_name` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_technicians_business_user` (`business_id`, `user_id`),
  KEY `idx_technicians_business_active` (`business_id`, `is_active`),
  CONSTRAINT `fk_technicians_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_technicians_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `professional_services` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `professional_id` BIGINT UNSIGNED NOT NULL,
  `service_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_professional_services` (`professional_id`, `service_id`),
  KEY `idx_professional_services_service` (`service_id`),
  CONSTRAINT `fk_professional_services_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_professional_services_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `business_services` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `business_id` BIGINT UNSIGNED NOT NULL,
  `service_id` BIGINT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_services` (`business_id`, `service_id`),
  KEY `idx_business_services_service` (`service_id`),
  CONSTRAINT `fk_business_services_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_business_services_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `service_areas` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `professional_id` BIGINT UNSIGNED NULL,
  `business_id` BIGINT UNSIGNED NULL,
  `area_name` VARCHAR(128) NOT NULL COMMENT 'Public operating-area label; no precise private geo data.',
  `city` VARCHAR(128) NULL,
  `province` VARCHAR(128) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_service_areas_professional` (`professional_id`),
  KEY `idx_service_areas_business` (`business_id`),
  KEY `idx_service_areas_city` (`city`),
  -- Exactly-one-owner rule enforced by backend services (see note above).
  CONSTRAINT `fk_service_areas_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_service_areas_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- +migrate Down
DROP TABLE IF EXISTS `service_areas`;
DROP TABLE IF EXISTS `business_services`;
DROP TABLE IF EXISTS `professional_services`;
DROP TABLE IF EXISTS `technicians`;
DROP TABLE IF EXISTS `business_members`;
DROP TABLE IF EXISTS `customer_profiles`;
DROP TABLE IF EXISTS `business_profiles`;
DROP TABLE IF EXISTS `professional_profiles`;
