-- Product gallery (multiple images per product).
-- ADDITIVE ONLY: creates one new table and copies data into it.
-- Nothing is dropped, renamed or deleted; `products`.`image_url` / `image_path` stay as they are.

-- CreateTable
CREATE TABLE `product_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `product_id` INTEGER NOT NULL,
    `path` VARCHAR(500) NULL,
    `url` VARCHAR(500) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_images_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every product's current image becomes the first (cover) image of its gallery.
INSERT INTO `product_images` (`product_id`, `path`, `url`, `sort_order`, `created_at`)
SELECT `id`, `image_path`, `image_url`, 0, CURRENT_TIMESTAMP(3)
FROM `products`
WHERE `image_url` IS NOT NULL AND `image_url` <> '';
