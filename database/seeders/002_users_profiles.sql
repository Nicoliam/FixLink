-- FixLink seeder 002 — Users, roles, profiles, businesses, technicians.
-- ALL data is fictional (example.co.za emails, 555-range phones). No real people.
-- password_hash values are scrypt hashes of the fictional dev password
-- 'FixLink-dev-001'. Production authentication (Stage 5+) will use bcrypt.

INSERT INTO `users` (`id`, `email`, `phone`, `password_hash`, `status`, `email_verified_at`, `phone_verified_at`, `created_at`) VALUES
  (1, 'admin@fixlink.example.co.za', '+27825550100', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-08-01 08:00:00', '2026-08-01 08:05:00', '2026-08-01 08:00:00'),
  (2, 'naledi.dlamini@example.co.za', '+27825550101', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-01 09:00:00', NULL, '2026-09-01 09:00:00'),
  (3, 'pieter.vdm@example.co.za', '+27825550102', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-02 10:00:00', NULL, '2026-09-02 10:00:00'),
  (4, 'aisha.patel@example.co.za', '+27825550103', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-03 11:00:00', NULL, '2026-09-03 11:00:00'),
  (5, 'sipho.ndlovu@example.co.za', '+27825550104', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-01 12:00:00', '2026-09-05 12:00:00', '2026-09-01 12:00:00'),
  (6, 'johan.botha@example.co.za', '+27825550105', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-01 12:30:00', NULL, '2026-09-01 12:30:00'),
  (7, 'maria.santos@example.co.za', '+27825550106', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-04 08:00:00', NULL, '2026-09-04 08:00:00'),
  (8, 'thabo.maseko@example.co.za', '+27825550107', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-08-20 09:00:00', '2026-08-20 09:10:00', '2026-08-20 09:00:00'),
  (9, 'lerato.khumalo@example.co.za', '+27825550108', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-08-21 09:00:00', NULL, '2026-08-21 09:00:00'),
  (10, 'bongani.zulu@example.co.za', '+27825550109', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-08-22 09:00:00', NULL, '2026-08-22 09:00:00'),
  (11, 'karin.meyer@example.co.za', '+27825550110', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-08-23 09:00:00', NULL, '2026-08-23 09:00:00'),
  (12, 'david.naidoo@example.co.za', '+27825550111', 'scrypt$0fef142001574ba7be28cc2bf5c7f8f3$3f709decacec4a523df443dca0eb849449a96e088b27a6c8b926453436c41b650f37b2108a901be941b76f0f3a65af41435f5c369ad615e805deda23e84bed97', 'ACTIVE', '2026-09-10 09:00:00', NULL, '2026-09-10 09:00:00');

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
  (1, 6),
  (2, 1), (3, 1), (4, 1),
  (5, 2), (6, 2), (7, 2),
  (8, 3), (9, 4), (10, 5), (11, 5),
  (12, 3);

-- Businesses first (customer_profiles.business_id references them).
INSERT INTO `business_profiles` (`id`, `owner_user_id`, `business_name`, `slug`, `description`, `email`, `phone`, `city`, `province`, `verification_status`, `rating_avg`, `rating_count`) VALUES
  (1, 8, 'Ubuntu Plumbing Co.', 'ubuntu-plumbing-co', 'Family-run plumbing team serving Joburg North since 2012.', 'hello@ubuntuplumbing.example.co.za', '+27115550101', 'Johannesburg', 'Gauteng', 'VERIFIED', 4.60, 48),
  (2, 12, 'Cape Spark Electrical', 'cape-spark-electrical', 'Residential electricians across the Cape Peninsula.', 'hello@capespark.example.co.za', '+27215550102', 'Cape Town', 'Western Cape', 'PENDING', 0.00, 0);

INSERT INTO `business_members` (`business_id`, `user_id`, `role`, `joined_at`) VALUES
  (1, 8, 'BUSINESS_OWNER', '2026-08-20 09:00:00'),
  (1, 9, 'BUSINESS_MANAGER', '2026-08-21 09:00:00'),
  (1, 10, 'TECHNICIAN', '2026-08-22 09:00:00'),
  (1, 11, 'TECHNICIAN', '2026-08-23 09:00:00'),
  (2, 12, 'BUSINESS_OWNER', '2026-09-10 09:00:00');

INSERT INTO `technicians` (`id`, `business_id`, `user_id`, `display_name`) VALUES
  (1, 1, 10, 'Bongani Zulu'),
  (2, 1, 11, 'Karin Meyer');

-- Customers: three marketplace (login) + one business-managed (no login).
INSERT INTO `customer_profiles` (`id`, `user_id`, `business_id`, `first_name`, `last_name`, `email`, `phone`, `preferred_contact`) VALUES
  (1, 2, NULL, 'Naledi', 'Dlamini', 'naledi.dlamini@example.co.za', '+27825550101', 'PHONE'),
  (2, 3, NULL, 'Pieter', 'van der Merwe', 'pieter.vdm@example.co.za', '+27825550102', 'EMAIL'),
  (3, 4, NULL, 'Aisha', 'Patel', 'aisha.patel@example.co.za', '+27825550103', 'PHONE'),
  (4, NULL, 1, 'Jabulani', 'Sithole', NULL, '+27825550190', 'PHONE');

INSERT INTO `professional_profiles` (`id`, `user_id`, `display_name`, `bio`, `experience_years`, `verification_status`, `rating_avg`, `rating_count`) VALUES
  (1, 5, 'Sipho Ndlovu — ProPlumb', 'PIRB-registered plumber doing leaks, geysers and drains across Joburg North.', 9, 'VERIFIED', 4.80, 64),
  (2, 6, 'Johan Botha Electrical', 'Residential electrician: fault finding, DB boards and lighting in Centurion.', 12, 'VERIFIED', 4.70, 41),
  (3, 7, 'Maria Santos Painting', 'Neat, reliable painter for interiors and exteriors in Durban North.', 6, 'PENDING', 0.00, 0);

INSERT INTO `professional_services` (`professional_id`, `service_id`) VALUES
  (1, 1), (1, 2), (1, 3),
  (2, 4), (2, 5),
  (3, 6), (3, 7);

INSERT INTO `business_services` (`business_id`, `service_id`) VALUES
  (1, 1), (1, 2), (1, 3),
  (2, 4), (2, 5);

INSERT INTO `service_areas` (`professional_id`, `business_id`, `area_name`, `city`, `province`) VALUES
  (1, NULL, 'Randburg & surrounds', 'Johannesburg', 'Gauteng'),
  (1, NULL, 'Sandton', 'Johannesburg', 'Gauteng'),
  (2, NULL, 'Centurion', 'Centurion', 'Gauteng'),
  (3, NULL, 'Durban North', 'Durban', 'KwaZulu-Natal'),
  (NULL, 1, 'Johannesburg North', 'Johannesburg', 'Gauteng'),
  (NULL, 1, 'Pretoria East', 'Pretoria', 'Gauteng'),
  (NULL, 2, 'Southern Suburbs', 'Cape Town', 'Western Cape');
