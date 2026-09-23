-- FixLink migration 009 — Stage 6F work documentation support
-- Reuses job_images / job_updates / job_status_history (no new tables).
-- Both columns are NULLABLE so existing rows and earlier stages are
-- unaffected: phase distinguishes BEFORE/DURING/AFTER progress notes
-- (images already had it), and original_filename preserves the upload
-- name while file_reference stays the opaque server-side storage key.

-- +migrate Up
ALTER TABLE `job_updates`
  ADD COLUMN `phase` ENUM('BEFORE','DURING','AFTER') NULL COMMENT 'Work phase for Stage 6F progress notes.' AFTER `author_id`,
  ADD KEY `idx_job_updates_job_phase` (`job_id`, `phase`);

ALTER TABLE `job_images`
  ADD COLUMN `original_filename` VARCHAR(255) NULL COMMENT 'Sanitized original upload name (never used for paths).' AFTER `file_reference`;

-- +migrate Down
ALTER TABLE `job_images` DROP COLUMN `original_filename`;
ALTER TABLE `job_updates` DROP KEY `idx_job_updates_job_phase`;
ALTER TABLE `job_updates` DROP COLUMN `phase`;
