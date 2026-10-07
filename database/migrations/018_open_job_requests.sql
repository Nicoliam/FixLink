-- Fixlynk migration 018 — Open job requests
--
-- Adds to: jobs (one composite index)
--
-- Adds no columns.
--
-- Step 14 lets a customer post a job request without choosing a
-- professional. `jobs.professional_id` and `jobs.business_id` have been
-- nullable since migration 004, so an "open request" — one offered to every
-- matching provider rather than to one chosen professional — already fits the
-- schema with both columns NULL. Nothing about the table needs to change to
-- represent it; the existing nullability is the flag.
--
-- What does need to change is indexing. The open-request board query filters
-- on:
--
--   source = 'MARKETPLACE'
--   professional_id IS NULL AND business_id IS NULL
--   status IN ('REQUESTED','QUOTED')
--
-- The existing idx_jobs_professional / idx_jobs_business indexes cannot
-- serve that. Their defining columns are exactly the ones being tested for
-- NULL, and a NULL never matches an index range — MySQL falls back to the
-- narrower idx_jobs_status and then filters. On a table whose newest rows are
-- the open ones, that is a scan of every marketplace job in the status
-- window. idx_jobs_open_board is ordered so the two selective leading
-- predicates (a single source value, a single NULL/IS NULL pair) are used
-- together and created_at is the ordering column, so the newest-first board
-- ordering comes from the index rather than a filesort.
--
-- Deliberately NOT added here:
--
-- - A `job_assignments` 'UNASSIGNED' value. An open request has no
--   assignment row at all; quoting, not assigning, is what brings a provider
--   into contact with the job (see quotes.service canActOn). Adding an enum
--   value nobody writes would be schema without behaviour.
--
-- - A quote-count column on `jobs`. The 3-quote cap is counted inside the
--   create-quote transaction while the job row is held with FOR UPDATE. A
--   denormalised counter would need its own increment path and could drift;
--   COUNT(*) over at most a handful of rows is not the bottleneck.
--
-- - `service_areas.latitude/longitude/radius_km`. Open-request matching is
--   category plus an area-name/city/province comparison, and no coordinates
--   are collected. docs/MVP-SCOPE.md section 19 keeps distance-based matching
--   out of scope, and docs/USER-FLOWS.md section 2.6.2 records the area
--   comparison as a stated limitation rather than radius matching. Adding
--   columns nothing writes would be speculative schema.
--
-- - A `notifications.type` change. That column is VARCHAR(64) (migration
--   008), not an ENUM, so the new JOB_REQUEST_OPEN notification type needs no
--   schema change.

-- +migrate Up
ALTER TABLE `jobs`
  ADD KEY `idx_jobs_open_board` (`source`,`professional_id`,`business_id`,`status`,`created_at`);

-- +migrate Down
ALTER TABLE `jobs`
  DROP KEY `idx_jobs_open_board`;