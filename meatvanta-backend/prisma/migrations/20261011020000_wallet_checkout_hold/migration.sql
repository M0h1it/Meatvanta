-- Wallet money reserved while a Razorpay payment window is open (additive).
ALTER TABLE `pending_checkouts`
  ADD COLUMN `wallet_phone` VARCHAR(10) NULL,
  ADD COLUMN `wallet_hold` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN `wallet_state` VARCHAR(10) NULL;

CREATE INDEX `pending_checkouts_wallet_state_created_at_idx` ON `pending_checkouts`(`wallet_state`, `created_at`);
