-- Wallet (store credit keyed by phone) + items the shop could not send. Additive only.

-- AlterTable: money bookkeeping on the order
ALTER TABLE `orders`
  ADD COLUMN `wallet_used` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `unavailable_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `wallet_credited` DECIMAL(10, 2) NOT NULL DEFAULT 0;

-- AlterTable: what the customer asked for vs what is sent
ALTER TABLE `order_items` ADD COLUMN `ordered_quantity` INTEGER NULL;

-- Existing lines: what was ordered is what was sent.
UPDATE `order_items` SET `ordered_quantity` = `quantity` WHERE `ordered_quantity` IS NULL;

-- CreateTable
CREATE TABLE `wallet_accounts` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `phone` VARCHAR(10) NOT NULL,
  `balance` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `held` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `wallet_accounts_phone_key`(`phone`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `wallet_transactions` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `account_id` INTEGER NOT NULL,
  `type` VARCHAR(20) NOT NULL,
  `amount` DECIMAL(10, 2) NOT NULL,
  `balance_after` DECIMAL(10, 2) NOT NULL,
  `order_id` INTEGER NULL,
  `order_number` VARCHAR(20) NULL,
  `reason` VARCHAR(255) NOT NULL,
  `created_by_admin_id` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `wallet_transactions_account_id_idx`(`account_id`),
  INDEX `wallet_transactions_order_id_idx`(`order_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `wallet_transactions`
  ADD CONSTRAINT `wallet_transactions_account_id_fkey`
  FOREIGN KEY (`account_id`) REFERENCES `wallet_accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
