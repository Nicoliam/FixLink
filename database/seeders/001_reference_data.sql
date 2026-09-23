-- FixLink seeder 001 — Reference data: roles, service categories, services.
-- Fictional catalogue data only.

INSERT INTO `roles` (`id`, `name`, `description`) VALUES
  (1, 'CUSTOMER', 'Marketplace customer (homeowner, tenant, landlord, property manager)'),
  (2, 'PROFESSIONAL', 'Independent service professional'),
  (3, 'BUSINESS_OWNER', 'Service business owner'),
  (4, 'BUSINESS_MANAGER', 'Service business manager'),
  (5, 'TECHNICIAN', 'Business team member / field technician'),
  (6, 'ADMIN', 'Platform administrator');

INSERT INTO `service_categories` (`id`, `name`, `slug`, `description`, `sort_order`) VALUES
  (1, 'Plumbing', 'plumbing', 'Water, leaks, geysers and drainage work', 10),
  (2, 'Electrical', 'electrical', 'Wiring, boards, lighting and fault finding', 20),
  (3, 'Painting', 'painting', 'Interior and exterior painting', 30),
  (4, 'Building & Renovation', 'building-renovation', 'Plastering, cracks, small building work', 40),
  (5, 'Handyman', 'handyman', 'General home repairs and odd jobs', 50),
  (6, 'Appliances', 'appliances', 'Home appliance repairs', 60),
  (7, 'Air Conditioning', 'air-conditioning', 'Aircon service and installation', 70),
  (8, 'Gardening', 'gardening', 'Garden cleanup and maintenance', 80),
  (9, 'Cleaning', 'cleaning', 'Home and deep cleaning', 90);

INSERT INTO `services` (`id`, `category_id`, `name`, `slug`, `description`, `sort_order`) VALUES
  (1, 1, 'Leak Repair & Pipe Fixes', 'leak-repair', 'Fix leaking taps, pipes and fittings', 10),
  (2, 1, 'Geyser Installation & Repair', 'geyser-install-repair', 'Geyser installs, replacements and repairs', 20),
  (3, 1, 'Drain Unblocking', 'drain-unblocking', 'Blocked drains, basins and sewer lines', 30),
  (4, 2, 'DB Board & Wiring Repairs', 'db-board-wiring', 'Distribution boards, wiring faults and CoC-related fixes', 10),
  (5, 2, 'Lighting Installation', 'lighting-installation', 'Downlights, security lights and fittings', 20),
  (6, 3, 'Interior Painting', 'interior-painting', 'Walls, ceilings and trims inside the home', 10),
  (7, 3, 'Exterior Painting', 'exterior-painting', 'Outside walls, roofs and boundary walls', 20),
  (8, 4, 'Wall Crack & Plaster Repair', 'wall-crack-plaster-repair', 'Crack stitching, plastering and skimming', 10),
  (9, 5, 'General Handyman', 'general-handyman', 'Small mixed repairs around the home', 10),
  (10, 6, 'Appliance Repair', 'appliance-repair', 'Washing machines, fridges, stoves and ovens', 10),
  (11, 7, 'Aircon Service & Install', 'aircon-service-install', 'Split-unit service, regas and installs', 10),
  (12, 8, 'Garden Cleanup & Maintenance', 'garden-cleanup-maintenance', 'Once-off cleanups and ongoing upkeep', 10),
  (13, 9, 'Home Deep Cleaning', 'home-deep-cleaning', 'Full home deep cleans and move cleans', 10);
