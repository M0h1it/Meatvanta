-- Failed-delivery tracking + cash hand-over tracking.
ALTER TABLE `orders`
  ADD COLUMN `delivery_failed_at` DATETIME(3) NULL,
  ADD COLUMN `delivery_attempts` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `cash_settled_at` DATETIME(3) NULL,
  ADD COLUMN `cash_settled_by_name` VARCHAR(100) NULL;

CREATE INDEX `orders_cash_settled_at_idx` ON `orders`(`cash_settled_at`);

-- Cash from deliveries made before this feature existed is treated as already
-- handed over; otherwise every rider would start with a huge made-up balance.
UPDATE `orders`
   SET `cash_settled_at` = COALESCE(`delivered_at`, `updated_at`),
       `cash_settled_by_name` = 'Before cash tracking'
 WHERE `payment_method` = 'cod' AND `status` = 'delivered';
