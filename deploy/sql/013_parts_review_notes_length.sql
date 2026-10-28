-- +migrate Up
ALTER TABLE `parts_requests`
  MODIFY COLUMN `review_notes` VARCHAR(1000) NULL;

-- +migrate Down
ALTER TABLE `parts_requests`
  MODIFY COLUMN `review_notes` VARCHAR(500) NULL;
