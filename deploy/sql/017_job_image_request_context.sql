-- Fixlynk migration 017 — Request-time job photos
--
-- Adds to: job_images (created in migration 005, extended by 009)
--
--   context  ENUM('REQUEST','WORK') NOT NULL DEFAULT 'WORK'
--
-- Why this column exists:
--
-- A customer now uploads photos of the problem when they request a job, so a
-- professional can assess scope before quoting. Those photos are evidence of
-- the customer's problem. They are NOT the professional's work record.
--
-- Reusing `phase = 'BEFORE'` for them was rejected, and the reason is worth
-- keeping: `phase` means "where the professional was in the work" (migration
-- 009 added it for BEFORE/DURING/AFTER work documentation). A customer photo
-- taken before the job was even accepted is a different thing, and merging
-- the two would make the timeline claim a professional documented work they
-- never did. It would also let a customer write into the provider's work
-- record, which breaks the ownership model in PERMISSIONS.md.
--
-- So `context` discriminates the two populations while keeping ONE table:
--
--   REQUEST  uploaded by the owning customer, while the job is still
--            REQUESTED/QUOTED — evidence attached to the request
--   WORK     uploaded by the addressed provider or assigned technician
--            during execution — the Before/During/After work record
--
-- One table means one foreign key, one cascade, one storage-key namespace and
-- one authorization path for reads (AGENTS.md section 9 keeps one job engine;
-- section 16 forbids duplicating a table for the same concept). The column
-- makes the distinction explicit instead of implicit in `uploader_id`.
--
-- DEFAULT 'WORK' is deliberate and is why this is backward compatible:
-- every existing row is work documentation, so adding the column with that
-- default reclassifies nothing. Without it, adding a NOT NULL column to a
-- populated table would require a table rewrite.
--
-- Read visibility is unchanged: `GET /jobs/:jobId/images` already admits the
-- owning customer and the addressed provider, which is exactly the audience
-- for request photos. There is no per-image visibility column because the job
-- boundary already provides it.

-- +migrate Up
ALTER TABLE `job_images`
  ADD COLUMN `context` ENUM('REQUEST','WORK') NOT NULL DEFAULT 'WORK'
    COMMENT 'REQUEST = customer evidence attached to the request; WORK = professional/technician execution evidence.' AFTER `phase`;

-- Serves the provider reading a request's photos alongside the work record.
ALTER TABLE `job_images`
  ADD KEY `idx_job_images_job_context` (`job_id`,`context`);

-- +migrate Down
ALTER TABLE `job_images`
  DROP KEY `idx_job_images_job_context`,
  DROP COLUMN `context`;
