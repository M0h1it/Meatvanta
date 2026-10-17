-- AlterTable: link an order to the delivery rider (an admin user) - additive, all nullable
ALTER TABLE `orders`
    ADD COLUMN `delivery_admin_id` INTEGER NULL,
    ADD COLUMN `delivery_person_phone` VARCHAR(20) NULL,
    ADD COLUMN `delivery_assigned_at` DATETIME(3) NULL,
    ADD COLUMN `picked_up_at` DATETIME(3) NULL,
    ADD COLUMN `delivery_failed_reason` VARCHAR(255) NULL;

CREATE INDEX `orders_delivery_admin_id_idx` ON `orders`(`delivery_admin_id`);

ALTER TABLE `orders`
    ADD CONSTRAINT `orders_delivery_admin_id_fkey` FOREIGN KEY (`delivery_admin_id`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: notifications can be addressed to one admin (null = shop-wide, as before)
ALTER TABLE `notifications` ADD COLUMN `admin_user_id` INTEGER NULL;
CREATE INDEX `notifications_admin_user_id_idx` ON `notifications`(`admin_user_id`);
