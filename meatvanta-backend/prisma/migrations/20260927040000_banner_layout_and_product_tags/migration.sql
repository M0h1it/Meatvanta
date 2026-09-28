-- Banner shapes, product MRP and product tags.
-- ADDITIVE ONLY: three new tables and two new columns with safe defaults.
-- Nothing is dropped, renamed or deleted; existing banners and products look exactly as before.

-- AlterTable
ALTER TABLE `product_variants` ADD COLUMN `mrp` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `banners` ADD COLUMN `focus` VARCHAR(10) NOT NULL DEFAULT 'center';

-- CreateTable
CREATE TABLE `banner_placement_settings` (
    `placement` VARCHAR(30) NOT NULL,
    `desktop_ratio` VARCHAR(10) NOT NULL DEFAULT 'auto',
    `mobile_ratio` VARCHAR(10) NOT NULL DEFAULT 'auto',
    `full_width` BOOLEAN NOT NULL DEFAULT false,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`placement`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_tags` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `label` VARCHAR(30) NOT NULL,
    `color` VARCHAR(10) NOT NULL DEFAULT 'red',
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `show_countdown` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `product_tags_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `key` VARCHAR(50) NOT NULL,
    `value` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_tags` ADD CONSTRAINT `product_tags_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
