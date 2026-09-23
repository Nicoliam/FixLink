-- FixLink seeder 004 — Internal business job, parts flow, portfolio,
-- certificates, verification and audit trail. All data fictional.

-- Job 5: INTERNAL job by Ubuntu Plumbing for business-managed customer Jabulani.
INSERT INTO `jobs` (`id`, `reference`, `source`, `customer_id`, `professional_id`, `business_id`, `service_id`, `title`, `description`, `address_line1`, `city`, `province`, `postal_code`, `priority`, `scheduled_at`, `status`, `agreed_amount`, `currency`, `created_by`, `created_at`) VALUES
  (5, 'FL-2026-000201', 'INTERNAL', 4, NULL, 1, 3, 'Blocked main drain', 'Repeat blockage on the main sewer line. Jetting done in June; likely root ingress at the boundary trap.', '9 Acacia Road, Blairgowrie', 'Johannesburg', 'Gauteng', '2194', 'HIGH', '2026-09-19 08:00:00', 'AWAITING_PARTS', 2400.00, 'ZAR', 9, '2026-09-18 08:00:00');

-- Assignment history: Karin first, then reassigned to Bongani (active).
INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `professional_id`, `business_id`, `technician_id`, `assigned_by`, `assigned_at`, `unassigned_at`, `notes`) VALUES
  (5, 'BUSINESS', NULL, 1, NULL, 9, '2026-09-18 08:05:00', NULL, 'Internal job created'),
  (5, 'TECHNICIAN', NULL, NULL, 2, 9, '2026-09-18 08:10:00', '2026-09-18 16:30:00', 'Initial assignment'),
  (5, 'TECHNICIAN', NULL, NULL, 1, 9, '2026-09-18 16:35:00', NULL, 'Reassigned: Karin called in sick');

INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`, `created_at`) VALUES
  (5, NULL, 'SCHEDULED', 9, 'Internal job created and scheduled', '2026-09-18 08:00:00'),
  (5, 'SCHEDULED', 'IN_PROGRESS', 11, 'Work started on site', '2026-09-19 08:10:00'),
  (5, 'IN_PROGRESS', 'AWAITING_PARTS', 10, 'Boundary trap cracked; replacement section needed', '2026-09-19 11:25:00');

INSERT INTO `job_images` (`job_id`, `uploader_id`, `phase`, `file_reference`, `mime_type`, `file_size`, `caption`) VALUES
  (5, 11, 'BEFORE', 'jobs/5/before-manhole.jpg', 'image/jpeg', 390400, 'Manhole surcharged on arrival'),
  (5, 10, 'DURING', 'jobs/5/during-exposed-trap.jpg', 'image/jpeg', 402115, 'Cracked boundary trap exposed');

INSERT INTO `job_updates` (`job_id`, `author_id`, `message`, `created_at`) VALUES
  (5, 11, 'Rodded 12m from upstream manhole, hit solid obstruction at the boundary. Opening up to inspect.', '2026-09-19 09:50:00'),
  (5, 10, 'Took over from Karin. Trap collar is cracked — needs a 110mm repair section before we jet. Parts requested.', '2026-09-19 11:25:00');

-- Parts flow: Bongani requests, Lerato (manager) approves.
INSERT INTO `parts_requests` (`id`, `job_id`, `requester_id`, `status`, `reason`, `reviewed_by`, `reviewed_at`, `review_notes`) VALUES
  (1, 5, 10, 'APPROVED', 'Cracked 110mm boundary trap collar; need repair section and couplers to restore line.', 9, '2026-09-19 12:05:00', 'Approved — collect from Builders Express, Northriding.');

INSERT INTO `parts_request_items` (`parts_request_id`, `part_name`, `quantity`, `notes`, `photo_reference`, `photo_mime`, `photo_size`) VALUES
  (1, '110mm PVC repair section (1m)', 1, 'Must be SANS 791 rated', 'parts/1/cracked-trap.jpg', 'image/jpeg', 310200),
  (1, '110mm straight coupler', 2, NULL, NULL, NULL, NULL);

INSERT INTO `job_approvals` (`job_id`, `request_type`, `parts_request_id`, `requested_by`, `reviewed_by`, `status`, `comments`, `requested_at`, `reviewed_at`) VALUES
  (5, 'PARTS', 1, 10, 9, 'APPROVED', 'Standard repair stock, within approval limit.', '2026-09-19 11:30:00', '2026-09-19 12:05:00');

INSERT INTO `notifications` (`user_id`, `type`, `title`, `message`, `reference_type`, `reference_id`, `created_at`) VALUES
  (10, 'JOB_ASSIGNED', 'Job reassigned to you', 'Blocked main drain (FL-2026-000201) reassigned to you by Lerato.', 'JOB', 5, '2026-09-18 16:35:00'),
  (9, 'PARTS_REQUESTED', 'Parts request needs review', 'Bongani requested parts for FL-2026-000201.', 'PARTS_REQUEST', 1, '2026-09-19 11:30:00'),
  (10, 'PARTS_DECIDED', 'Parts request approved', 'Lerato approved your parts request for FL-2026-000201.', 'PARTS_REQUEST', 1, '2026-09-19 12:05:00');

-- Portfolio: Sipho publishes geyser-adjacent work from job 1; Ubuntu publishes project.
INSERT INTO `portfolio_projects` (`id`, `professional_id`, `business_id`, `service_id`, `source_job_id`, `title`, `description`, `is_published`) VALUES
  (1, 1, NULL, 1, 1, 'Northcliff kitchen leak repair', 'Leaking mixer replaced, cupboard dried and resealed. Same-day fix.', 1),
  (2, NULL, 1, 3, NULL, 'Blairgowrie drain rehabilitation', 'Ongoing: boundary trap replacement and full line jetting.', 1);

INSERT INTO `portfolio_images` (`project_id`, `file_reference`, `mime_type`, `file_size`, `kind`, `sort_order`, `uploaded_by`) VALUES
  (1, 'portfolio/1/before-sink.jpg', 'image/jpeg', 405000, 'BEFORE', 1, 5),
  (1, 'portfolio/1/after-sink.jpg', 'image/jpeg', 411300, 'AFTER', 2, 5),
  (2, 'portfolio/2/during-excavation.jpg', 'image/jpeg', 398700, 'GENERAL', 1, 8);

-- Certificates: Sipho approved; Maria pending.
INSERT INTO `certificates` (`id`, `professional_id`, `business_id`, `title`, `issuing_organisation`, `issue_date`, `expiry_date`, `verification_status`, `document_reference`, `document_mime`, `document_size`) VALUES
  (1, 1, NULL, 'PIRB Registered Plumber', 'Plumbing Industry Registration Board', '2023-03-14', '2027-03-13', 'APPROVED', 'certificates/1/sipho-pirb.pdf', 'application/pdf', 245800),
  (2, 3, NULL, 'Paint Contractor Certificate', 'Durban Skills Academy (fictional)', '2025-06-01', NULL, 'PENDING', 'certificates/2/maria-paint.pdf', 'application/pdf', 198400);

INSERT INTO `certificate_verifications` (`certificate_id`, `reviewed_by`, `decision`, `notes`, `reviewed_at`) VALUES
  (1, 1, 'APPROVED', 'Registration number validated against PIRB records (fictional check).', '2026-09-06 10:00:00');

-- Verification workflows + current identity state for Sipho.
INSERT INTO `verification_requests` (`id`, `user_id`, `type`, `status`, `details`, `reviewed_by`, `reviewed_at`, `review_notes`) VALUES
  (1, 5, 'IDENTITY', 'APPROVED', '{"method": "id_document", "note": "Fictional dev record"}', 1, '2026-09-06 09:30:00', 'ID document and selfie match (fictional check).'),
  (2, 8, 'BUSINESS', 'APPROVED', '{"entity": "Ubuntu Plumbing Co.", "note": "Fictional dev record"}', 1, '2026-08-25 11:00:00', 'CIPC-style docs on file (fictional check).'),
  (3, 7, 'CERTIFICATE', 'PENDING', '{"certificate": "Paint Contractor Certificate"}', NULL, NULL, NULL);

INSERT INTO `identity_verifications` (`user_id`, `verification_request_id`, `document_reference`, `document_mime`, `status`, `reviewed_by`, `reviewed_at`, `review_notes`) VALUES
  (5, 1, 'verification/identity/user-5-id.pdf', 'application/pdf', 'APPROVED', 1, '2026-09-06 09:30:00', 'Approved (fictional dev record).'),
  (7, NULL, 'verification/identity/user-7-id.pdf', 'application/pdf', 'PENDING', NULL, NULL, NULL);

INSERT INTO `audit_logs` (`actor_id`, `action`, `entity_type`, `entity_id`, `metadata`) VALUES
  (1, 'VERIFICATION_APPROVED', 'verification_request', 1, '{"type": "IDENTITY", "subject_user_id": 5}'),
  (1, 'CERTIFICATE_APPROVED', 'certificate', 1, '{"professional_id": 1}');
