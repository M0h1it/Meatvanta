-- Optional category card photos (additive, nullable - existing rows untouched).
ALTER TABLE `categories`
  ADD COLUMN `image_path` VARCHAR(500) NULL,
  ADD COLUMN `image_url` VARCHAR(500) NULL,
  ADD COLUMN `mobile_image_path` VARCHAR(500) NULL,
  ADD COLUMN `mobile_image_url` VARCHAR(500) NULL;
