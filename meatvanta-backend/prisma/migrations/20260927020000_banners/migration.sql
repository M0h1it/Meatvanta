-- Offers & banners for the customer site.
-- ADDITIVE ONLY: creates one new table. Nothing existing is changed.

-- CreateTable
CREATE TABLE `banners` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `placement` VARCHAR(30) NOT NULL,
    `text` VARCHAR(200) NULL,
    `media_type` VARCHAR(10) NULL,
    `desktop_path` VARCHAR(500) NULL,
    `desktop_url` VARCHAR(500) NULL,
    `mobile_path` VARCHAR(500) NULL,
    `mobile_url` VARCHAR(500) NULL,
    `poster_path` VARCHAR(500) NULL,
    `poster_url` VARCHAR(500) NULL,
    `alt_text` VARCHAR(200) NULL,
    `link_type` VARCHAR(20) NOT NULL DEFAULT 'none',
    `link_value` VARCHAR(500) NULL,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `banners_placement_is_active_idx`(`placement`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
