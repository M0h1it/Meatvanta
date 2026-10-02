const express = require("express");
const router = express.Router();

const couponsController = require("../../controllers/coupons/coupons.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

router.get("/", requireAuth, requirePermission("coupons:view"), couponsController.list);
// New-customer welcome offer settings (before "/:id" so it isn't read as an id).
router.get("/new-customer-offer", requireAuth, requirePermission("coupons:view"), couponsController.getNewCustomerOffer);
router.put("/new-customer-offer", requireAuth, requirePermission("coupons:update"), couponsController.updateNewCustomerOffer);
router.get("/:id", requireAuth, requirePermission("coupons:view"), couponsController.getOne);
router.post("/", requireAuth, requirePermission("coupons:create"), couponsController.create);
router.put("/:id", requireAuth, requirePermission("coupons:update"), couponsController.update);
router.delete("/:id", requireAuth, requirePermission("coupons:delete"), couponsController.remove);

module.exports = router;
