-- Map pin snapshot on each order (set when the customer's saved address has a pin).
ALTER TABLE `orders`
  ADD COLUMN `delivery_latitude` DECIMAL(10, 7) NULL,
  ADD COLUMN `delivery_longitude` DECIMAL(10, 7) NULL;
