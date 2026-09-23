-- MySQL dump 10.13  Distrib 9.6.0, for macos26.3 (arm64)
--
-- Host: 127.0.0.1    Database: fixlink
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audit_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `actor_id` bigint unsigned DEFAULT NULL,
  `action` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. VERIFICATION_APPROVED, USER_SUSPENDED.',
  `entity_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` bigint unsigned DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audit_logs_actor` (`actor_id`),
  KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`),
  KEY `idx_audit_logs_created` (`created_at`),
  CONSTRAINT `fk_audit_logs_actor` FOREIGN KEY (`actor_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Immutable; no updated_at by design.';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_members`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_members` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `business_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `role` enum('BUSINESS_OWNER','BUSINESS_MANAGER','TECHNICIAN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `invited_at` datetime DEFAULT NULL,
  `joined_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_members_business_user` (`business_id`,`user_id`),
  KEY `idx_business_members_user` (`user_id`),
  KEY `idx_business_members_role` (`business_id`,`role`),
  CONSTRAINT `fk_business_members_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_business_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_profiles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `owner_user_id` bigint unsigned NOT NULL COMMENT 'Creating owner; further members live in business_members.',
  `business_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `logo_reference` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `logo_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postal_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('UNVERIFIED','PENDING','VERIFIED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNVERIFIED',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_profiles_slug` (`slug`),
  KEY `idx_business_profiles_owner` (`owner_user_id`),
  KEY `idx_business_profiles_city` (`city`),
  CONSTRAINT `fk_business_profiles_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_business_profiles_rating` CHECK (((`rating_avg` >= 0) and (`rating_avg` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_services`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `business_services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `business_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_business_services` (`business_id`,`service_id`),
  KEY `idx_business_services_service` (`service_id`),
  CONSTRAINT `fk_business_services_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_business_services_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `certificate_verifications`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `certificate_verifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `certificate_id` bigint unsigned NOT NULL,
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT 'Admin reviewer.',
  `decision` enum('APPROVED','REJECTED','NEEDS_INFO') COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_certificate_verifications_cert` (`certificate_id`,`reviewed_at`),
  KEY `fk_certificate_verifications_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_certificate_verifications_cert` FOREIGN KEY (`certificate_id`) REFERENCES `certificates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_certificate_verifications_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `certificates`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `certificates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `issuing_organisation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `verification_status` enum('PENDING','APPROVED','REJECTED','NEEDS_INFO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `document_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Private storage key; never exposed publicly.',
  `document_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `document_size` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_certificates_professional` (`professional_id`),
  KEY `idx_certificates_business` (`business_id`),
  KEY `idx_certificates_status` (`verification_status`),
  CONSTRAINT `fk_certificates_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_certificates_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conversation_participants`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversation_participants` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `left_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_conversation_participants` (`conversation_id`,`user_id`),
  KEY `idx_conversation_participants_user` (`user_id`),
  CONSTRAINT `fk_conversation_participants_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_conversation_participants_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `conversations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `conversations` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned DEFAULT NULL COMMENT 'Job this conversation relates to, if any.',
  `subject` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversations_job` (`job_id`),
  KEY `fk_conversations_created_by` (`created_by`),
  CONSTRAINT `fk_conversations_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_conversations_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `customer_profiles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `customer_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL COMMENT 'NULL for business-managed customers without a login.',
  `business_id` bigint unsigned DEFAULT NULL COMMENT 'Owning business for internal (non-marketplace) customers.',
  `first_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `last_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_photo_reference` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'External storage key only; never binary.',
  `profile_photo_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `preferred_contact` enum('EMAIL','PHONE','WHATSAPP') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_customer_profiles_user` (`user_id`),
  KEY `idx_customer_profiles_business` (`business_id`),
  KEY `idx_customer_profiles_name` (`last_name`,`first_name`),
  CONSTRAINT `fk_customer_profiles_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_customer_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `disputes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `disputes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `opened_by` bigint unsigned DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('OPEN','IN_REVIEW','RESOLVED','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `resolution` text COLLATE utf8mb4_unicode_ci,
  `resolved_by` bigint unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_disputes_job` (`job_id`),
  KEY `idx_disputes_status` (`status`),
  KEY `fk_disputes_opened_by` (`opened_by`),
  KEY `fk_disputes_resolved_by` (`resolved_by`),
  CONSTRAINT `fk_disputes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_disputes_opened_by` FOREIGN KEY (`opened_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_disputes_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `identity_verifications`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `identity_verifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT 'One current record per user; workflow history lives in verification_requests.',
  `verification_request_id` bigint unsigned DEFAULT NULL,
  `document_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Private storage key; never exposed publicly.',
  `document_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','NEEDS_INFO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `reviewed_by` bigint unsigned DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_identity_verifications_user` (`user_id`),
  KEY `fk_identity_verifications_request` (`verification_request_id`),
  KEY `fk_identity_verifications_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_identity_verifications_request` FOREIGN KEY (`verification_request_id`) REFERENCES `verification_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_identity_verifications_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_identity_verifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_approvals`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_approvals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `request_type` enum('PARTS','STATUS_CHANGE','COMPLETION','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `parts_request_id` bigint unsigned DEFAULT NULL,
  `requested_by` bigint unsigned DEFAULT NULL,
  `reviewed_by` bigint unsigned DEFAULT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','NEEDS_INFO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `comments` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_approvals_job` (`job_id`),
  KEY `idx_job_approvals_status` (`status`),
  KEY `fk_job_approvals_parts_request` (`parts_request_id`),
  KEY `fk_job_approvals_requested_by` (`requested_by`),
  KEY `fk_job_approvals_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_job_approvals_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_parts_request` FOREIGN KEY (`parts_request_id`) REFERENCES `parts_requests` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_approvals_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_assignments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_assignments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `assignment_type` enum('PROFESSIONAL','BUSINESS','TECHNICIAN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `technician_id` bigint unsigned DEFAULT NULL,
  `assigned_by` bigint unsigned DEFAULT NULL,
  `assigned_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `unassigned_at` datetime DEFAULT NULL COMMENT 'Set on reassignment; NULL means currently active.',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_assignments_job` (`job_id`),
  KEY `idx_job_assignments_active` (`job_id`,`unassigned_at`),
  KEY `idx_job_assignments_technician` (`technician_id`,`unassigned_at`),
  KEY `fk_job_assignments_professional` (`professional_id`),
  KEY `fk_job_assignments_business` (`business_id`),
  KEY `fk_job_assignments_assigned_by` (`assigned_by`),
  CONSTRAINT `fk_job_assignments_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_job_assignments_technician` FOREIGN KEY (`technician_id`) REFERENCES `technicians` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_images`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `uploader_id` bigint unsigned DEFAULT NULL,
  `phase` enum('BEFORE','DURING','AFTER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'External storage key.',
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL COMMENT 'Bytes.',
  `caption` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_images_job_phase` (`job_id`,`phase`),
  KEY `idx_job_images_uploader` (`uploader_id`),
  CONSTRAINT `fk_job_images_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_job_images_uploader` FOREIGN KEY (`uploader_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_status_history`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_status_history` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `previous_status` enum('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `new_status` enum('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `changed_by` bigint unsigned DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_status_history_job` (`job_id`,`created_at`),
  KEY `fk_job_status_history_changed_by` (`changed_by`),
  CONSTRAINT `fk_job_status_history_changed_by` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_status_history_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=20 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_updates`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_updates` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `author_id` bigint unsigned DEFAULT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_updates_job` (`job_id`,`created_at`),
  KEY `fk_job_updates_author` (`author_id`),
  CONSTRAINT `fk_job_updates_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_updates_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `job_voice_notes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_voice_notes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `author_id` bigint unsigned DEFAULT NULL,
  `file_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'External storage key for the audio file.',
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL COMMENT 'Bytes.',
  `duration_seconds` int unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_job_voice_notes_job` (`job_id`),
  KEY `fk_job_voice_notes_author` (`author_id`),
  CONSTRAINT `fk_job_voice_notes_author` FOREIGN KEY (`author_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_job_voice_notes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `jobs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `jobs` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reference` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Human-friendly reference, e.g. FL-2026-000123. Generated app-side.',
  `source` enum('MARKETPLACE','INTERNAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `service_id` bigint unsigned DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `address_line1` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `postal_code` varchar(16) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `latitude` decimal(10,7) DEFAULT NULL,
  `longitude` decimal(10,7) DEFAULT NULL,
  `priority` enum('LOW','NORMAL','HIGH','URGENT') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NORMAL',
  `scheduled_at` datetime DEFAULT NULL,
  `status` enum('REQUESTED','QUOTED','ACCEPTED','SCHEDULED','IN_PROGRESS','AWAITING_PARTS','COMPLETED','CONFIRMED','CLOSED','CANCELLED','DISPUTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'REQUESTED',
  `agreed_amount` decimal(12,2) DEFAULT NULL COMMENT 'Agreed quote amount (recorded only; no payment processing in MVP).',
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZAR',
  `created_by` bigint unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `confirmed_at` datetime DEFAULT NULL,
  `closed_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_jobs_reference` (`reference`),
  KEY `idx_jobs_status` (`status`),
  KEY `idx_jobs_customer` (`customer_id`),
  KEY `idx_jobs_professional` (`professional_id`),
  KEY `idx_jobs_business` (`business_id`),
  KEY `idx_jobs_service` (`service_id`),
  KEY `idx_jobs_scheduled` (`scheduled_at`),
  KEY `idx_jobs_created` (`created_at`),
  KEY `fk_jobs_created_by` (`created_by`),
  CONSTRAINT `fk_jobs_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_jobs_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_jobs_agreed_amount` CHECK (((`agreed_amount` is null) or (`agreed_amount` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `message_attachments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `message_attachments` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `message_id` bigint unsigned NOT NULL,
  `file_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `uploaded_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_message_attachments_message` (`message_id`),
  KEY `fk_message_attachments_uploader` (`uploaded_by`),
  CONSTRAINT `fk_message_attachments_message` FOREIGN KEY (`message_id`) REFERENCES `messages` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_message_attachments_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `messages`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint unsigned NOT NULL,
  `sender_id` bigint unsigned DEFAULT NULL,
  `body` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_messages_conversation` (`conversation_id`,`created_at`),
  KEY `fk_messages_sender` (`sender_id`),
  CONSTRAINT `fk_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_messages_sender` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `type` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'e.g. QUOTE_RECEIVED, JOB_ASSIGNED, PARTS_REQUESTED.',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci,
  `reference_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'e.g. JOB, QUOTE, PARTS_REQUEST.',
  `reference_id` bigint unsigned DEFAULT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read` (`user_id`,`read_at`,`created_at`),
  KEY `idx_notifications_type` (`type`),
  CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parts_request_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parts_request_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `parts_request_id` bigint unsigned NOT NULL,
  `part_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` int unsigned NOT NULL DEFAULT '1',
  `notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_reference` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'External storage key; never binary.',
  `photo_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photo_size` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parts_request_items_request` (`parts_request_id`),
  CONSTRAINT `fk_parts_request_items_request` FOREIGN KEY (`parts_request_id`) REFERENCES `parts_requests` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_parts_request_items_qty` CHECK ((`quantity` > 0))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `parts_requests`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parts_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `requester_id` bigint unsigned DEFAULT NULL COMMENT 'Technician/provider requesting parts.',
  `status` enum('PENDING','APPROVED','REJECTED','NEEDS_INFO','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT 'Manager/owner; must differ from requester (enforced by backend).',
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_parts_requests_job` (`job_id`),
  KEY `idx_parts_requests_status` (`status`),
  KEY `idx_parts_requests_requester` (`requester_id`),
  KEY `fk_parts_requests_reviewed_by` (`reviewed_by`),
  CONSTRAINT `fk_parts_requests_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_parts_requests_requester` FOREIGN KEY (`requester_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_parts_requests_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `portfolio_images`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `portfolio_images` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `project_id` bigint unsigned NOT NULL,
  `file_reference` varchar(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mime_type` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `file_size` bigint unsigned DEFAULT NULL,
  `kind` enum('BEFORE','AFTER','GENERAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GENERAL',
  `sort_order` int NOT NULL DEFAULT '0',
  `uploaded_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_portfolio_images_project` (`project_id`,`sort_order`),
  KEY `fk_portfolio_images_uploader` (`uploaded_by`),
  CONSTRAINT `fk_portfolio_images_project` FOREIGN KEY (`project_id`) REFERENCES `portfolio_projects` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_images_uploader` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `portfolio_projects`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `portfolio_projects` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `service_id` bigint unsigned DEFAULT NULL,
  `source_job_id` bigint unsigned DEFAULT NULL COMMENT 'Completed job this work was published from, if any.',
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `is_published` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_portfolio_professional` (`professional_id`),
  KEY `idx_portfolio_business` (`business_id`),
  KEY `idx_portfolio_service` (`service_id`),
  KEY `fk_portfolio_source_job` (`source_job_id`),
  CONSTRAINT `fk_portfolio_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_portfolio_source_job` FOREIGN KEY (`source_job_id`) REFERENCES `jobs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `professional_profiles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_profiles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `experience_years` int unsigned DEFAULT NULL,
  `profile_photo_reference` varchar(512) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `profile_photo_mime` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verification_status` enum('UNVERIFIED','PENDING','VERIFIED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UNVERIFIED',
  `rating_avg` decimal(3,2) NOT NULL DEFAULT '0.00',
  `rating_count` int unsigned NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_professional_profiles_user` (`user_id`),
  KEY `idx_professional_profiles_active` (`is_active`),
  KEY `idx_professional_profiles_rating` (`rating_avg`),
  CONSTRAINT `fk_professional_profiles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_professional_profiles_rating` CHECK (((`rating_avg` >= 0) and (`rating_avg` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `professional_services`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `professional_services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `professional_id` bigint unsigned NOT NULL,
  `service_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_professional_services` (`professional_id`,`service_id`),
  KEY `idx_professional_services_service` (`service_id`),
  CONSTRAINT `fk_professional_services_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_professional_services_service` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quote_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quote_items` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `quote_id` bigint unsigned NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantity` decimal(10,2) NOT NULL DEFAULT '1.00',
  `unit_price` decimal(12,2) NOT NULL,
  `total` decimal(12,2) GENERATED ALWAYS AS ((`quantity` * `unit_price`)) STORED COMMENT 'Derived; never trusted from client input.',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quote_items_quote` (`quote_id`),
  CONSTRAINT `fk_quote_items_quote` FOREIGN KEY (`quote_id`) REFERENCES `quotes` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_quote_items_money` CHECK (((`quantity` > 0) and (`unit_price` >= 0)))
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `quotes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `quotes` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `total` decimal(12,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ZAR',
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('DRAFT','SUBMITTED','ACCEPTED','DECLINED','WITHDRAWN','EXPIRED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `valid_until` datetime DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `accepted_at` datetime DEFAULT NULL,
  `declined_at` datetime DEFAULT NULL,
  `withdrawn_at` datetime DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quotes_job` (`job_id`),
  KEY `idx_quotes_status` (`status`),
  KEY `idx_quotes_professional` (`professional_id`),
  KEY `idx_quotes_business` (`business_id`),
  KEY `fk_quotes_created_by` (`created_by`),
  CONSTRAINT `fk_quotes_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_quotes_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_quotes_total` CHECK ((`total` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reports`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reports` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `reporter_id` bigint unsigned DEFAULT NULL,
  `report_type` enum('PROVIDER','REVIEW','JOB','USER','CONTENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entity_id` bigint unsigned DEFAULT NULL,
  `reason` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `status` enum('OPEN','IN_REVIEW','RESOLVED','DISMISSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `resolved_by` bigint unsigned DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reports_status` (`status`),
  KEY `idx_reports_type` (`report_type`),
  KEY `fk_reports_reporter` (`reporter_id`),
  KEY `fk_reports_resolver` (`resolved_by`),
  CONSTRAINT `fk_reports_reporter` FOREIGN KEY (`reporter_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_reports_resolver` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `review_responses`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `review_responses` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `review_id` bigint unsigned NOT NULL COMMENT 'One response per review.',
  `responder_id` bigint unsigned DEFAULT NULL,
  `response` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_review_responses_review` (`review_id`),
  KEY `fk_review_responses_responder` (`responder_id`),
  CONSTRAINT `fk_review_responses_responder` FOREIGN KEY (`responder_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_review_responses_review` FOREIGN KEY (`review_id`) REFERENCES `reviews` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `reviews`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `reviews` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `job_id` bigint unsigned NOT NULL COMMENT 'One review per job.',
  `customer_id` bigint unsigned NOT NULL,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `rating` tinyint unsigned NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `is_visible` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reviews_job` (`job_id`),
  KEY `idx_reviews_professional` (`professional_id`),
  KEY `idx_reviews_business` (`business_id`),
  KEY `idx_reviews_customer` (`customer_id`),
  CONSTRAINT `fk_reviews_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_job` FOREIGN KEY (`job_id`) REFERENCES `jobs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_reviews_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `chk_reviews_rating` CHECK (((`rating` >= 1) and (`rating` <= 5)))
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'CUSTOMER, PROFESSIONAL, BUSINESS_OWNER, BUSINESS_MANAGER, TECHNICIAN, ADMIN',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `saved_professionals`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `saved_professionals` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `customer_id` bigint unsigned NOT NULL,
  `saved_professional_id` bigint unsigned DEFAULT NULL,
  `saved_business_id` bigint unsigned DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_saved_professionals_customer` (`customer_id`),
  KEY `fk_saved_professionals_professional` (`saved_professional_id`),
  KEY `fk_saved_professionals_business` (`saved_business_id`),
  CONSTRAINT `fk_saved_professionals_business` FOREIGN KEY (`saved_business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_professionals_customer` FOREIGN KEY (`customer_id`) REFERENCES `customer_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_saved_professionals_professional` FOREIGN KEY (`saved_professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schema_migrations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_migrations` (
  `version` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `schema_seeds`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schema_seeds` (
  `seed_file` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`seed_file`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_areas`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_areas` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `professional_id` bigint unsigned DEFAULT NULL,
  `business_id` bigint unsigned DEFAULT NULL,
  `area_name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Public operating-area label; no precise private geo data.',
  `city` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `province` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_service_areas_professional` (`professional_id`),
  KEY `idx_service_areas_business` (`business_id`),
  KEY `idx_service_areas_city` (`city`),
  CONSTRAINT `fk_service_areas_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_service_areas_professional` FOREIGN KEY (`professional_id`) REFERENCES `professional_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `service_categories`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `service_categories` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_service_categories_slug` (`slug`),
  UNIQUE KEY `uq_service_categories_name` (`name`),
  KEY `idx_service_categories_active` (`is_active`,`sort_order`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `services`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `services` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `category_id` bigint unsigned NOT NULL,
  `name` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `slug` varchar(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_services_slug` (`slug`),
  UNIQUE KEY `uq_services_category_name` (`category_id`,`name`),
  KEY `idx_services_category` (`category_id`),
  KEY `idx_services_active` (`is_active`),
  CONSTRAINT `fk_services_category` FOREIGN KEY (`category_id`) REFERENCES `service_categories` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `technicians`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `technicians` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `business_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL COMMENT 'Technicians are business team members; never auto-professionals.',
  `display_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_technicians_business_user` (`business_id`,`user_id`),
  KEY `idx_technicians_business_active` (`business_id`,`is_active`),
  KEY `fk_technicians_user` (`user_id`),
  CONSTRAINT `fk_technicians_business` FOREIGN KEY (`business_id`) REFERENCES `business_profiles` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_technicians_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user_roles`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_roles` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_roles_user_role` (`user_id`,`role_id`),
  KEY `idx_user_roles_role` (`role_id`),
  CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Never plaintext. Production auth uses bcrypt (see Stage 5).',
  `status` enum('PENDING','ACTIVE','SUSPENDED','DELETED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `email_verified_at` datetime DEFAULT NULL,
  `phone_verified_at` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` datetime DEFAULT NULL COMMENT 'Soft delete; historical rows (jobs, reviews) are preserved.',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_phone` (`phone`),
  KEY `idx_users_status` (`status`),
  KEY `idx_users_created_at` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `verification_requests`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `verification_requests` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL COMMENT 'Subject of the verification.',
  `type` enum('IDENTITY','CERTIFICATE','BUSINESS') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','NEEDS_INFO') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `details` json DEFAULT NULL COMMENT 'Non-sensitive supporting metadata only.',
  `reviewed_by` bigint unsigned DEFAULT NULL COMMENT 'Admin reviewer.',
  `reviewed_at` datetime DEFAULT NULL,
  `review_notes` varchar(1000) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_verification_requests_user` (`user_id`,`type`,`status`),
  KEY `idx_verification_requests_status` (`status`),
  KEY `fk_verification_requests_reviewer` (`reviewed_by`),
  CONSTRAINT `fk_verification_requests_reviewer` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_verification_requests_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-22 16:22:09
