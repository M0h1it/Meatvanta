-- AlterTable: social profile links for the customer footer (additive, existing rows get '')
ALTER TABLE `shop_info`
    ADD COLUMN `instagram_url` VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN `facebook_url` VARCHAR(300) NOT NULL DEFAULT '',
    ADD COLUMN `youtube_url` VARCHAR(300) NOT NULL DEFAULT '';
