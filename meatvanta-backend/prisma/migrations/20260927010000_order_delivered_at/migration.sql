-- Adds orders.delivered_at so analytics can count a sale by delivery date.
-- ADDITIVE ONLY: one new nullable column + index. Nothing is dropped or renamed.

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `delivered_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `orders_delivered_at_idx` ON `orders`(`delivered_at`);

-- Backfill: orders already delivered get their last-updated time as the best
-- available estimate of when they were delivered.
UPDATE `orders` SET `delivered_at` = `updated_at` WHERE `status` = 'delivered' AND `delivered_at` IS NULL;
