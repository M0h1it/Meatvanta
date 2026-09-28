-- Coupons for the customer site.
-- ADDITIVE ONLY: two new tables and three new nullable/defaulted columns on
-- `orders`. Nothing is dropped, renamed or deleted; existing orders are untouched.

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `coupon_id` INTEGER NULL,
    ADD COLUMN `coupon_code` VARCHAR(30) NULL,
    ADD COLUMN `free_delivery` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `coupons` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(30) NOT NULL,
    `description` VARCHAR(200) NULL,
    `type` VARCHAR(20) NOT NULL,
    `value` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `max_discount` DECIMAL(10, 2) NULL,
    `min_order_value` DECIMAL(10, 2) NULL,
    `applies_to` VARCHAR(20) NOT NULL DEFAULT 'all',
    `category_ids` JSON NULL,
    `product_ids` JSON NULL,
    `first_order_only` BOOLEAN NOT NULL DEFAULT false,
    `per_customer_limit` INTEGER NULL,
    `total_limit` INTEGER NULL,
    `used_count` INTEGER NOT NULL DEFAULT 0,
    `starts_at` DATETIME(3) NULL,
    `ends_at` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `show_on_site` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_redemptions` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coupon_id` INTEGER NOT NULL,
    `order_id` INTEGER NOT NULL,
    `customer_phone` VARCHAR(20) NOT NULL,
    `customer_id` INTEGER NULL,
    `discount` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupon_redemptions_order_id_key`(`order_id`),
    INDEX `coupon_redemptions_coupon_id_customer_phone_idx`(`coupon_id`, `customer_phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `orders_coupon_id_idx` ON `orders`(`coupon_id`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_redemptions` ADD CONSTRAINT `coupon_redemptions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
