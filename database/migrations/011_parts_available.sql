-- FixLink migration 011 — Stage 7F manager approvals + awaiting parts
--
-- Reuses the existing `parts_requests` / `parts_request_items` /
-- `job_approvals` / `jobs` / `job_status_history` tables (migrations 004
-- and 006) — no new tables. The single schema change extends the
-- `parts_requests.status` ENUM with PARTS_AVAILABLE so a business
-- owner/manager can mark an APPROVED request as fulfilled:
--
--   PENDING → APPROVED → PARTS_AVAILABLE
--   PENDING → REJECTED            (terminal)
--   PENDING → NEEDS_INFO → PENDING (technician responds, then review repeats)
--   NEEDS_INFO → APPROVED / REJECTED / NEEDS_INFO (manager acts again)
--
-- REJECTED / CANCELLED / PARTS_AVAILABLE are terminal (no further
-- transitions). Status vocabulary stays consistent with migration 006:
-- NEEDS_INFO (not MORE_INFO_REQUIRED) is the request-info state, and
-- `job_approvals.status` (PENDING/APPROVED/REJECTED/NEEDS_INFO) is
-- reused unchanged for the decision records.

-- +migrate Up
ALTER TABLE `parts_requests`
  MODIFY COLUMN `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO','CANCELLED','PARTS_AVAILABLE') NOT NULL DEFAULT 'PENDING';

-- +migrate Down
ALTER TABLE `parts_requests`
  MODIFY COLUMN `status` ENUM('PENDING','APPROVED','REJECTED','NEEDS_INFO','CANCELLED') NOT NULL DEFAULT 'PENDING';
