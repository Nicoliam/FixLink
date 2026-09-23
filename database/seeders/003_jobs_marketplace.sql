-- FixLink seeder 003 — Marketplace jobs, quotes, job activity, messaging, reviews.
-- Amounts in ZAR. File references are external storage keys (metadata only).

-- Job 1: Naledi x Sipho (leak repair), IN_PROGRESS with quote accepted.
INSERT INTO `jobs` (`id`, `reference`, `source`, `customer_id`, `professional_id`, `business_id`, `service_id`, `title`, `description`, `address_line1`, `city`, `province`, `postal_code`, `priority`, `scheduled_at`, `status`, `agreed_amount`, `currency`, `created_by`, `created_at`) VALUES
  (1, 'FL-2026-000101', 'MARKETPLACE', 1, 1, NULL, 1, 'Kitchen sink leak', 'Kitchen mixer tap leaking at the base and damp cupboard floor. Photos attached.', '14 Protea Avenue, Northcliff', 'Johannesburg', 'Gauteng', '2195', 'NORMAL', '2026-09-20 09:00:00', 'IN_PROGRESS', 1850.00, 'ZAR', 2, '2026-09-15 08:12:00'),
  (2, 'FL-2026-000102', 'MARKETPLACE', 2, NULL, 1, 2, 'Geyser replacement 150L', 'No hot water since Monday; geyser tripping the DB board. Plumber advised replacement.', '7 Jacaranda Street, Waterkloof', 'Pretoria', 'Gauteng', '0181', 'HIGH', '2026-09-24 08:00:00', 'SCHEDULED', 6500.00, 'ZAR', 3, '2026-09-16 10:40:00'),
  (3, 'FL-2026-000103', 'MARKETPLACE', 3, 2, NULL, 4, 'DB board tripping', 'Lights circuit trips every evening around 19:00. Need fault finding and fix.', '22 Palm Boulevard, Umhlanga', 'Durban', 'KwaZulu-Natal', '4319', 'NORMAL', '2026-09-18 13:00:00', 'COMPLETED', 3200.00, 'ZAR', 4, '2026-09-12 14:05:00'),
  (4, 'FL-2026-000104', 'MARKETPLACE', 1, 3, NULL, 6, 'Bedroom repaint', 'Master bedroom walls need repainting, light grey. About 4m x 5m, one accent wall.', '14 Protea Avenue, Northcliff', 'Johannesburg', 'Gauteng', '2195', 'LOW', NULL, 'REQUESTED', NULL, 'ZAR', 2, '2026-09-21 17:30:00');

INSERT INTO `job_status_history` (`job_id`, `previous_status`, `new_status`, `changed_by`, `reason`, `created_at`) VALUES
  (1, NULL, 'REQUESTED', 2, 'Customer submitted request', '2026-09-15 08:12:00'),
  (1, 'REQUESTED', 'QUOTED', 5, 'Quote submitted', '2026-09-15 13:20:00'),
  (1, 'QUOTED', 'ACCEPTED', 2, 'Customer accepted quote', '2026-09-16 09:02:00'),
  (1, 'ACCEPTED', 'SCHEDULED', 5, 'Visit booked', '2026-09-16 09:30:00'),
  (1, 'SCHEDULED', 'IN_PROGRESS', 5, 'Work started on site', '2026-09-20 09:05:00'),
  (2, NULL, 'REQUESTED', 3, 'Customer submitted request', '2026-09-16 10:40:00'),
  (2, 'REQUESTED', 'QUOTED', 8, 'Quote submitted', '2026-09-16 15:00:00'),
  (2, 'QUOTED', 'ACCEPTED', 3, 'Customer accepted quote', '2026-09-17 08:15:00'),
  (2, 'ACCEPTED', 'SCHEDULED', 9, 'Technician booking confirmed', '2026-09-17 09:00:00'),
  (3, NULL, 'REQUESTED', 4, 'Customer submitted request', '2026-09-12 14:05:00'),
  (3, 'REQUESTED', 'QUOTED', 6, 'Quote submitted', '2026-09-12 16:45:00'),
  (3, 'QUOTED', 'ACCEPTED', 4, 'Customer accepted quote', '2026-09-13 08:00:00'),
  (3, 'ACCEPTED', 'SCHEDULED', 6, 'Visit booked', '2026-09-13 08:20:00'),
  (3, 'SCHEDULED', 'IN_PROGRESS', 6, 'Work started on site', '2026-09-18 13:05:00'),
  (3, 'IN_PROGRESS', 'COMPLETED', 6, 'Fault fixed and tested', '2026-09-18 16:40:00'),
  (4, NULL, 'REQUESTED', 2, 'Customer submitted request', '2026-09-21 17:30:00');

INSERT INTO `job_assignments` (`job_id`, `assignment_type`, `professional_id`, `business_id`, `technician_id`, `assigned_by`, `assigned_at`, `unassigned_at`) VALUES
  (1, 'PROFESSIONAL', 1, NULL, NULL, 5, '2026-09-16 09:30:00', NULL),
  (2, 'BUSINESS', NULL, 1, NULL, 9, '2026-09-17 09:00:00', NULL),
  (2, 'TECHNICIAN', NULL, NULL, 1, 9, '2026-09-17 09:05:00', NULL),
  (3, 'PROFESSIONAL', 2, NULL, NULL, 6, '2026-09-13 08:20:00', NULL);

INSERT INTO `quotes` (`id`, `job_id`, `professional_id`, `business_id`, `total`, `currency`, `description`, `status`, `submitted_at`, `accepted_at`, `created_by`) VALUES
  (1, 1, 1, NULL, 1850.00, 'ZAR', 'Replace mixer tap cartridge and seals, dry out and reseal cupboard base. Labour + parts.', 'ACCEPTED', '2026-09-15 13:20:00', '2026-09-16 09:02:00', 5),
  (2, 2, NULL, 1, 6500.00, 'ZAR', 'Supply and install 150L high-pressure geyser incl. valves, drip tray and compliance paperwork.', 'ACCEPTED', '2026-09-16 15:00:00', '2026-09-17 08:15:00', 8),
  (3, 3, 2, NULL, 3200.00, 'ZAR', 'Fault finding on lights circuit, replace faulty breaker and damaged wiring section, test and label.', 'ACCEPTED', '2026-09-12 16:45:00', '2026-09-13 08:00:00', 6);

INSERT INTO `quote_items` (`quote_id`, `description`, `quantity`, `unit_price`, `sort_order`) VALUES
  (1, 'Labour: tap repair and reseal', 1.00, 950.00, 1),
  (1, 'Mixer cartridge + seals kit', 1.00, 900.00, 2),
  (2, '150L high-pressure geyser unit', 1.00, 4800.00, 1),
  (2, 'Valves, tray, fittings + labour', 1.00, 1700.00, 2),
  (3, 'Fault finding labour (2h)', 2.00, 650.00, 1),
  (3, 'Breaker + wiring materials', 1.00, 1900.00, 2);

INSERT INTO `job_images` (`job_id`, `uploader_id`, `phase`, `file_reference`, `mime_type`, `file_size`, `caption`) VALUES
  (1, 2, 'BEFORE', 'jobs/1/before-sink-overview.jpg', 'image/jpeg', 412580, 'Leaking mixer and damp cupboard'),
  (1, 5, 'BEFORE', 'jobs/1/before-cupboard-closeup.jpg', 'image/jpeg', 388112, 'Close-up of water damage'),
  (1, 5, 'DURING', 'jobs/1/during-new-cartridge.jpg', 'image/jpeg', 401990, 'New cartridge fitted'),
  (3, 6, 'BEFORE', 'jobs/3/before-db-board.jpg', 'image/jpeg', 455010, 'DB board before repair'),
  (3, 6, 'AFTER', 'jobs/3/after-db-board.jpg', 'image/jpeg', 460221, 'Board rewired, labelled and tested');

INSERT INTO `job_updates` (`job_id`, `author_id`, `message`, `created_at`) VALUES
  (1, 5, 'On site. Isolated water, old cartridge removed — seat is pitted, fitting new cartridge and resealing base.', '2026-09-20 09:40:00'),
  (1, 5, 'New cartridge in, no leaks after 15-min pressure test. Drying cupboard, will reseal and photograph.', '2026-09-20 11:15:00'),
  (3, 6, 'Fault traced to damaged neutral on the lights circuit. Breaker replaced, circuit megger-tested OK.', '2026-09-18 15:30:00');

INSERT INTO `job_voice_notes` (`job_id`, `author_id`, `file_reference`, `mime_type`, `file_size`, `duration_seconds`) VALUES
  (1, 5, 'jobs/1/voicenote-pressure-test.m4a', 'audio/mp4', 184320, 42);

-- Conversation on job 1 between Naledi (user 2) and Sipho (user 5).
INSERT INTO `conversations` (`id`, `job_id`, `subject`, `created_by`) VALUES
  (1, 1, 'Kitchen sink leak — access details', 2);
INSERT INTO `conversation_participants` (`conversation_id`, `user_id`) VALUES
  (1, 2), (1, 5);
INSERT INTO `messages` (`id`, `conversation_id`, `sender_id`, `body`, `created_at`) VALUES
  (1, 1, 2, 'Hi Sipho, gate code is 4455 and the dogs are locked away. Park in the driveway.', '2026-09-19 18:02:00'),
  (2, 1, 5, 'Thanks Naledi, see you at 09:00. Please keep the cupboard under the sink clear.', '2026-09-19 18:20:00');
INSERT INTO `message_attachments` (`message_id`, `file_reference`, `mime_type`, `file_size`, `uploaded_by`) VALUES
  (1, 'messages/1/gate-map.png', 'image/png', 96400, 2);

-- Review on completed job 3 (Aisha x Johan) with provider response.
INSERT INTO `reviews` (`id`, `job_id`, `customer_id`, `professional_id`, `business_id`, `rating`, `comment`) VALUES
  (1, 3, 3, 2, NULL, 5, 'Johan arrived on time, found the fault fast and explained everything. DB is neat and labelled now.');
INSERT INTO `review_responses` (`review_id`, `responder_id`, `response`) VALUES
  (1, 6, 'Thank you Aisha! Glad the lights are behaving. Call anytime if anything trips again.');

INSERT INTO `notifications` (`user_id`, `type`, `title`, `message`, `reference_type`, `reference_id`, `created_at`) VALUES
  (2, 'QUOTE_RECEIVED', 'New quote for Kitchen sink leak', 'Sipho Ndlovu quoted R1 850.00.', 'QUOTE', 1, '2026-09-15 13:20:00'),
  (5, 'QUOTE_ACCEPTED', 'Quote accepted', 'Naledi accepted your quote of R1 850.00 for FL-2026-000101.', 'JOB', 1, '2026-09-16 09:02:00'),
  (9, 'JOB_ASSIGNED', 'Geyser job scheduled', 'FL-2026-000102 scheduled with Bongani for 24 Sept.', 'JOB', 2, '2026-09-17 09:05:00'),
  (6, 'REVIEW_RECEIVED', 'New 5-star review', 'Aisha rated your DB board job 5 stars.', 'REVIEW', 1, '2026-09-19 10:00:00');

INSERT INTO `saved_professionals` (`customer_id`, `saved_professional_id`, `saved_business_id`) VALUES
  (1, 1, NULL),
  (1, NULL, 1);
