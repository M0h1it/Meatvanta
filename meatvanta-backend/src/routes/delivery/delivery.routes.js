const express = require("express");
const router = express.Router();

const deliveryController = require("../../controllers/delivery/delivery.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { requireAnyPermission } = require("../../middlewares/anyPermission.middleware");

// Dropdown of riders for the order screen - whoever may assign a rider.
router.get("/riders", requireAuth, requireAnyPermission("delivery:assign", "orders:updateStatus"), deliveryController.listRiders);

// Failed delivery: the owner decides - send again (same or another rider) or cancel.
router.post("/orders/:id/retry", requireAuth, requireAnyPermission("delivery:assign", "orders:updateStatus"), deliveryController.retry);
router.post("/orders/:id/cancel-failed", requireAuth, requirePermission("orders:cancel"), deliveryController.cancelFailed);

// Cash the riders collected and still hold; the owner marks it received.
router.get("/cash", requireAuth, requirePermission("delivery:settle"), deliveryController.cashSummary);
router.post("/cash/settle", requireAuth, requirePermission("delivery:settle"), deliveryController.settleCash);

// Rider's own screen. The service only ever returns orders assigned to the logged-in rider.
router.get("/my-cash", requireAuth, requirePermission("delivery:view"), deliveryController.myCash);
router.get("/my-orders", requireAuth, requirePermission("delivery:view"), deliveryController.myOrders);
router.post("/my-orders/:id/pickup", requireAuth, requirePermission("delivery:updateStatus"), deliveryController.pickUp);
router.post("/my-orders/:id/delivered", requireAuth, requirePermission("delivery:updateStatus"), deliveryController.deliver);
router.post("/my-orders/:id/failed", requireAuth, requirePermission("delivery:updateStatus"), deliveryController.failed);

module.exports = router;
