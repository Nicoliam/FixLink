-- FixLink seeder 005 — Stage 6A marketplace discovery data.
-- ALL data is fictional (example.co.za emails, 555-range phones). No real people.
-- password_hash values reuse the dev placeholder convention from seeder 002
-- (scrypt hash of the fictional dev password 'FixLink-dev-001').
--
-- Purpose: enough Joburg-North providers (Fourways, Sandton, Bryanston,
-- Randburg, Midrand) to exercise search, location filters, provider-type
-- filters, verification badges, portfolio Before/After, approved
-- certificates, reviews and empty states. Rating aggregates are illustrative.
-- Unpublished portfolio (project 5) and pending certificates (cert 4) exist
-- to prove the public API hides them.

INSERT INTO `users` (`id`, `email`, `phone`, `password_hash`, `status`, `email_verified_at`, `created_at`) VALUES
  (13, 'kabelo.mahlangu@example.co.za', '+27825550113', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-05 08:00:00', '2026-09-05 08:00:00'),
  (14, 'ayanda.sithole@example.co.za', '+27825550114', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-06 08:00:00', '2026-09-06 08:00:00'),
  (15, 'pieter.jacobs@example.co.za', '+27825550115', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-18 08:00:00', '2026-09-18 08:00:00'),
  (16, 'thandi.khumalo@example.co.za', '+27825550116', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-07 08:00:00', '2026-09-07 08:00:00');

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
  (13, 2), (14, 2), (15, 2),
  (16, 3);

INSERT INTO `professional_profiles` (`id`, `user_id`, `display_name`, `bio`, `experience_years`, `verification_status`, `rating_avg`, `rating_count`) VALUES
  (4, 13, 'Kabelo Mahlangu — Fix-It Handyman', 'Handyman for doors, locks, flat-packs, wall mounting and small repairs in Fourways and Bryanston.', 7, 'VERIFIED', 4.90, 87),
  (5, 14, 'Ayanda Sithole — Sparkle Cleans', 'Deep cleans, move-in/move-out cleans and office upkeep in Sandton and Midrand.', 5, 'VERIFIED', 4.90, 52),
  (6, 15, 'Pieter Jacobs Painting', 'Newly listed painter for single rooms and feature walls in Bryanston.', 3, 'UNVERIFIED', 0.00, 0);

INSERT INTO `professional_services` (`professional_id`, `service_id`) VALUES
  (4, 8), (4, 9),
  (5, 9), (5, 13),
  (6, 6);

INSERT INTO `service_areas` (`professional_id`, `business_id`, `area_name`, `city`, `province`) VALUES
  (4, NULL, 'Fourways', 'Johannesburg', 'Gauteng'),
  (4, NULL, 'Bryanston', 'Johannesburg', 'Gauteng'),
  (5, NULL, 'Sandton', 'Johannesburg', 'Gauteng'),
  (5, NULL, 'Midrand', 'Midrand', 'Gauteng'),
  (6, NULL, 'Bryanston', 'Johannesburg', 'Gauteng');

INSERT INTO `business_profiles` (`id`, `owner_user_id`, `business_name`, `slug`, `description`, `email`, `phone`, `city`, `province`, `verification_status`, `rating_avg`, `rating_count`) VALUES
  (3, 16, 'Randburg Volt & Solar', 'randburg-volt-solar', 'Residential electricians and small solar installs in Randburg and Midrand.', 'hello@randburgvolt.example.co.za', '+27115550103', 'Randburg', 'Gauteng', 'VERIFIED', 4.80, 35);

INSERT INTO `business_members` (`business_id`, `user_id`, `role`, `joined_at`) VALUES
  (3, 16, 'BUSINESS_OWNER', '2026-09-07 08:00:00');

INSERT INTO `business_services` (`business_id`, `service_id`) VALUES
  (3, 4), (3, 5), (3, 11);

INSERT INTO `service_areas` (`professional_id`, `business_id`, `area_name`, `city`, `province`) VALUES
  (NULL, 3, 'Randburg', 'Randburg', 'Gauteng'),
  (NULL, 3, 'Midrand', 'Midrand', 'Gauteng');

-- Completed marketplace jobs backing the new visible reviews.
INSERT INTO `jobs` (`id`, `reference`, `source`, `customer_id`, `professional_id`, `business_id`, `service_id`, `title`, `description`, `address_line1`, `city`, `province`, `postal_code`, `priority`, `scheduled_at`, `status`, `agreed_amount`, `currency`, `created_by`, `created_at`) VALUES
  (6, 'FL-2026-000105', 'MARKETPLACE', 1, 4, NULL, 9, 'Door and lock repairs', 'Two sticking doors planed, passage lock replaced and curtain rails mounted.', '8 Cedar Road, Fourways', 'Johannesburg', 'Gauteng', '2191', 'NORMAL', '2026-09-22 09:00:00', 'COMPLETED', 1450.00, 'ZAR', 2, '2026-09-19 08:00:00'),
  (7, 'FL-2026-000106', 'MARKETPLACE', 2, 5, NULL, 13, 'Move-out deep clean', 'Two-bedroom flat in Sandton, full deep clean incl. oven and windows.', 'Flat 12, 5 Fredman Drive, Sandton', 'Johannesburg', 'Gauteng', '2196', 'NORMAL', '2026-09-23 08:00:00', 'CONFIRMED', 2800.00, 'ZAR', 3, '2026-09-20 09:00:00');

INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`, `created_at`) VALUES
  (6, NULL, 'REQUESTED', 2, 'Customer submitted request', '2026-09-19 08:00:00'),
  (6, 'REQUESTED', 'QUOTED', 13, 'Quote submitted', '2026-09-19 12:00:00'),
  (6, 'QUOTED', 'ACCEPTED', 2, 'Customer accepted quote', '2026-09-19 15:00:00'),
  (6, 'ACCEPTED', 'SCHEDULED', 13, 'Visit booked', '2026-09-19 15:30:00'),
  (6, 'SCHEDULED', 'IN_PROGRESS', 13, 'Work started on site', '2026-09-22 09:05:00'),
  (6, 'IN_PROGRESS', 'COMPLETED', 13, 'All items done and checked', '2026-09-22 13:40:00'),
  (7, NULL, 'REQUESTED', 3, 'Customer submitted request', '2026-09-20 09:00:00'),
  (7, 'REQUESTED', 'QUOTED', 14, 'Quote submitted', '2026-09-20 11:00:00'),
  (7, 'QUOTED', 'ACCEPTED', 3, 'Customer accepted quote', '2026-09-20 14:00:00'),
  (7, 'ACCEPTED', 'SCHEDULED', 14, 'Visit booked', '2026-09-20 14:30:00'),
  (7, 'SCHEDULED', 'IN_PROGRESS', 14, 'Work started on site', '2026-09-23 08:05:00'),
  (7, 'IN_PROGRESS', 'COMPLETED', 14, 'Clean done, walkthrough signed', '2026-09-23 13:00:00'),
  (7, 'COMPLETED', 'CONFIRMED', 3, 'Customer confirmed completion', '2026-09-23 18:20:00');

INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `professional_id`, `business_id`, `technician_id`, `assigned_by`, `assigned_at`, `unassigned_at`) VALUES
  (6, 'PROFESSIONAL', 4, NULL, NULL, 13, '2026-09-19 15:30:00', NULL),
  (7, 'PROFESSIONAL', 5, NULL, NULL, 14, '2026-09-20 14:30:00', NULL);

INSERT INTO `quotes` (`id`, `job_id`, `professional_id`, `business_id`, `total`, `currency`, `description`, `status`, `submitted_at`, `accepted_at`, `created_by`) VALUES
  (4, 6, 4, NULL, 1450.00, 'ZAR', 'Door planing, lock replacement and curtain rail mounting. Labour + materials.', 'ACCEPTED', '2026-09-19 12:00:00', '2026-09-19 15:00:00', 13),
  (5, 7, 5, NULL, 2800.00, 'ZAR', 'Full deep clean of two-bedroom flat incl. oven, windows and balconies.', 'ACCEPTED', '2026-09-20 11:00:00', '2026-09-20 14:00:00', 14);

INSERT INTO `quote_items` (`quote_id`, `description`, `quantity`, `unit_price`, `sort_order`) VALUES
  (4, 'Labour: half-day handyman', 1.00, 950.00, 1),
  (4, 'Passage lock set + fittings', 1.00, 500.00, 2),
  (5, 'Deep clean labour (team of 2)', 1.00, 2200.00, 1),
  (5, 'Cleaning consumables', 1.00, 600.00, 2);

INSERT INTO `reviews` (`id`, `job_id`, `customer_id`, `professional_id`, `business_id`, `rating`, `comment`) VALUES
  (2, 6, 1, 4, NULL, 5, 'Kabelo was quick, tidy and the doors finally close properly. Will book again.'),
  (3, 7, 2, 5, NULL, 5, 'Flat handed back spotless — the agent even complimented the oven. Worth every rand.');

-- Portfolio: Kabelo + Ayanda published; Pieter's draft stays unpublished.
INSERT INTO `portfolio_projects` (`id`, `professional_id`, `business_id`, `service_id`, `source_job_id`, `title`, `description`, `is_published`) VALUES
  (3, 4, NULL, 9, 6, 'Fourways door and lock refresh', 'Sticking doors planed, new passage lock and rails mounted in one visit.', 1),
  (4, 5, NULL, 13, 7, 'Sandton move-out deep clean', 'Full flat reset: kitchen, bathrooms, oven, windows and balconies.', 1),
  (5, 6, NULL, 6, NULL, 'Bryanston feature wall (draft)', 'Work in progress — not yet published.', 0);

INSERT INTO `portfolio_images` (`project_id`, `file_reference`, `mime_type`, `file_size`, `kind`, `sort_order`, `uploaded_by`) VALUES
  (3, 'portfolio/3/before-doors.jpg', 'image/jpeg', 399100, 'BEFORE', 1, 13),
  (3, 'portfolio/3/after-doors.jpg', 'image/jpeg', 404550, 'AFTER', 2, 13),
  (4, 'portfolio/4/before-kitchen.jpg', 'image/jpeg', 395200, 'BEFORE', 1, 14),
  (4, 'portfolio/4/after-kitchen.jpg', 'image/jpeg', 401800, 'AFTER', 2, 14);

-- Certificates: Kabelo approved (public); Pieter's pending (hidden publicly).
INSERT INTO `certificates` (`id`, `professional_id`, `business_id`, `title`, `issuing_organisation`, `issue_date`, `expiry_date`, `verification_status`, `document_reference`, `document_mime`, `document_size`) VALUES
  (3, 4, NULL, 'Certified Handyman — Level 2', 'Gauteng Skills Academy (fictional)', '2024-05-20', '2027-05-19', 'APPROVED', 'certificates/3/kabelo-handyman.pdf', 'application/pdf', 201300),
  (4, 6, NULL, 'Paint Techniques Short Course', 'Bryanston Training Centre (fictional)', '2026-07-10', NULL, 'PENDING', 'certificates/4/pieter-paint.pdf', 'application/pdf', 188700);

INSERT INTO `certificate_verifications` (`certificate_id`, `reviewed_by`, `decision`, `notes`, `reviewed_at`) VALUES
  (3, 1, 'APPROVED', 'Certificate checked against fictional academy records.', '2026-09-10 10:00:00');

-- Verification workflows for the new providers + business.
INSERT INTO `verification_requests` (`id`, `user_id`, `type`, `status`, `details`, `reviewed_by`, `reviewed_at`, `review_notes`) VALUES
  (4, 13, 'IDENTITY', 'APPROVED', '{"method": "id_document", "note": "Fictional dev record"}', 1, '2026-09-10 09:00:00', 'ID document and selfie match (fictional check).'),
  (5, 14, 'IDENTITY', 'APPROVED', '{"method": "id_document", "note": "Fictional dev record"}', 1, '2026-09-11 09:00:00', 'ID document and selfie match (fictional check).'),
  (6, 16, 'BUSINESS', 'APPROVED', '{"entity": "Randburg Volt & Solar", "note": "Fictional dev record"}', 1, '2026-09-12 09:00:00', 'Business docs on file (fictional check).');

INSERT INTO `identity_verifications` (`user_id`, `verification_request_id`, `document_reference`, `document_mime`, `status`, `reviewed_by`, `reviewed_at`, `review_notes`) VALUES
  (13, 4, 'verification/identity/user-13-id.pdf', 'application/pdf', 'APPROVED', 1, '2026-09-10 09:00:00', 'Approved (fictional dev record).'),
  (14, 5, 'verification/identity/user-14-id.pdf', 'application/pdf', 'APPROVED', 1, '2026-09-11 09:00:00', 'Approved (fictional dev record).'),
  (15, NULL, 'verification/identity/user-15-id.pdf', 'application/pdf', 'PENDING', NULL, NULL, NULL);
