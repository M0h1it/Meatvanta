-- Combos (packs made of existing products) and recipes.
-- ADDITIVE ONLY: two new columns with safe defaults and five new tables.
-- Nothing is dropped, renamed or deleted; existing products and orders are unchanged.

-- AlterTable
ALTER TABLE `products` ADD COLUMN `is_combo` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `combo_items` JSON NULL;

-- CreateTable
CREATE TABLE `combo_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `combo_product_id` INTEGER NOT NULL,
    `variant_id` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `combo_items_combo_product_id_idx`(`combo_product_id`),
    INDEX `combo_items_variant_id_idx`(`variant_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(150) NOT NULL,
    `slug` VARCHAR(170) NOT NULL,
    `intro` TEXT NULL,
    `prep_minutes` INTEGER NULL,
    `cook_minutes` INTEGER NULL,
    `serves` INTEGER NULL,
    `difficulty` VARCHAR(10) NOT NULL DEFAULT 'easy',
    `spice_level` INTEGER NOT NULL DEFAULT 1,
    `video_url` VARCHAR(500) NULL,
    `image_url` VARCHAR(500) NULL,
    `is_published` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `recipes_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipe_images` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipe_id` INTEGER NOT NULL,
    `path` VARCHAR(500) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `recipe_images_recipe_id_idx`(`recipe_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipe_ingredients` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipe_id` INTEGER NOT NULL,
    `quantity` VARCHAR(30) NULL,
    `unit` VARCHAR(20) NULL,
    `name` VARCHAR(100) NOT NULL,
    `note` VARCHAR(100) NULL,
    `product_id` INTEGER NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `recipe_ingredients_recipe_id_idx`(`recipe_id`),
    INDEX `recipe_ingredients_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recipe_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recipe_id` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `flame` VARCHAR(10) NOT NULL DEFAULT 'none',
    `minutes` INTEGER NULL,
    `tip` VARCHAR(300) NULL,
    `image_path` VARCHAR(500) NULL,
    `image_url` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `recipe_steps_recipe_id_idx`(`recipe_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `combo_items` ADD CONSTRAINT `combo_items_combo_product_id_fkey` FOREIGN KEY (`combo_product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_items` ADD CONSTRAINT `combo_items_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recipe_images` ADD CONSTRAINT `recipe_images_recipe_id_fkey` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipe_id_fkey` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recipe_steps` ADD CONSTRAINT `recipe_steps_recipe_id_fkey` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
