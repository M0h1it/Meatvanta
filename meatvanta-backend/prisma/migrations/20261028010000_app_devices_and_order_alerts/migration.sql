-- Android order-alert app: signed-in phones + "seen it" tracking on orders. Additive only.

-- CreateTable
CREATE TABLE `app_devices` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `admin_user_id` INTEGER NOT NULL,
  `token_hash` VARCHAR(64) NOT NULL,
  `fcm_token` VARCHAR(512) NULL,
  `device_name` VARCHAR(120) NULL,
  `last_seen_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `app_devices_token_hash_key`(`token_hash`),
  INDEX `app_devices_admin_user_id_idx`(`admin_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `app_devices`
  ADD CONSTRAINT `app_devices_admin_user_id_fkey`
  FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: no backfill on purpose. Older orders are all finished, and the app only lists
-- orders that are still active, so they never show up as "new".
ALTER TABLE `orders`
  ADD COLUMN `acknowledged_at` DATETIME(3) NULL,
  ADD COLUMN `acknowledged_by_id` INTEGER NULL,
  ADD COLUMN `last_alert_sent_at` DATETIME(3) NULL;

CREATE INDEX `orders_acknowledged_by_id_idx` ON `orders`(`acknowledged_by_id`);

ALTER TABLE `orders`
  ADD CONSTRAINT `orders_acknowledged_by_id_fkey`
  FOREIGN KEY (`acknowledged_by_id`) REFERENCES `admin_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
