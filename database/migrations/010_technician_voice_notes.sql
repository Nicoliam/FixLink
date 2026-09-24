-- FixLink migration 010 — Stage 7D technician voice-note support
-- Reuses the existing `job_voice_notes` table from migration 005 (no new
-- tables). The single NULLABLE column preserves the upload name while
-- `file_reference` stays the opaque server-side storage key, mirroring
-- migration 009's `job_images.original_filename` addition.

-- +migrate Up
ALTER TABLE `job_voice_notes`
  ADD COLUMN `original_filename` VARCHAR(255) NULL COMMENT 'Sanitized original upload name (never used for paths).' AFTER `file_reference`;

-- +migrate Down
ALTER TABLE `job_voice_notes` DROP COLUMN `original_filename`;
