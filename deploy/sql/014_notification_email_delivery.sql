-- Fixlynk migration 014 — Stage 13 provider notification email
--
-- No new tables. The `notifications` table (migration 008) already stores
-- one row per recipient per event; Stage 13 adds an email channel on top
-- of that row, so the only schema change is recording how the email
-- attempt for that row turned out.
--
-- Why this matters: a provider email is the only signal a professional who
-- is not signed in gets. Without a recorded outcome, "we chose not to
-- email" and "the relay rejected the send" look identical, and a support
-- admin has no way to answer a provider who says they never received the
-- job request.
--
--   email_status  PENDING (attempting) | SENT | FAILED | SKIPPED
--   emailed_at    when the send succeeded
--   email_error   truncated, non-sensitive failure reason
--
-- SKIPPED records a deliberate non-delivery (recipient not a provider-side
-- account, account not ACTIVE, no email address, or no addressable screen),
-- which is different from FAILED. All three columns are nullable: NULL
-- means the channel was not attempted at all (mail disabled, or the
-- deployment runs in-app only), which is how an unconfigured deployment
-- behaves.

-- +migrate Up
ALTER TABLE `notifications`
  ADD COLUMN `email_status` VARCHAR(16) NULL COMMENT 'PENDING, SENT, FAILED or SKIPPED; NULL when the email channel was not attempted.' AFTER `read_at`,
  ADD COLUMN `emailed_at` DATETIME NULL COMMENT 'When the notification email was accepted for delivery.' AFTER `email_status`,
  ADD COLUMN `email_error` VARCHAR(255) NULL COMMENT 'Truncated, non-sensitive failure reason.' AFTER `emailed_at`,
  ADD KEY `idx_notifications_email_status` (`email_status`, `created_at`);

-- +migrate Down
ALTER TABLE `notifications`
  DROP KEY `idx_notifications_email_status`,
  DROP COLUMN `email_error`,
  DROP COLUMN `emailed_at`,
  DROP COLUMN `email_status`;
