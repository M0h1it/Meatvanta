const express = require("express");
const router = express.Router();

const ordersController = require("../../controllers/orders/orders.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { requireAnyPermission } = require("../../middlewares/anyPermission.middleware");

// Dashboard stats (order counts, today's sales). Needs orders:view now - a delivery
// rider is a logged-in admin too and must not see the shop's numbers.
router.get("/stats/summary", requireAuth, requirePermission("orders:view"), ordersController.stats);

router.post("/", requireAuth, requirePermission("orders:create"), ordersController.create);
router.get("/", requireAuth, requirePermission("orders:view"), ordersController.list);
router.get("/:id", requireAuth, requirePermission("orders:view"), ordersController.getOne);
router.patch("/:id/status", requireAuth, requirePermission("orders:updateStatus"), ordersController.updateStatus);
router.post("/:id/cancel", requireAuth, requirePermission("orders:cancel"), ordersController.cancel);
// An item ran out after the order was placed: send the rest, drop this part (see orderAdjustments.service.js).
router.post("/:id/unavailable", requireAuth, requirePermission("orders:adjustItems"), ordersController.markUnavailable);
router.patch("/:id/payment", requireAuth, requirePermission("orders:updateStatus"), ordersController.verifyPayment);
router.patch("/:id/delivery-charge", requireAuth, requirePermission("orders:updateStatus"), ordersController.setDeliveryCharge);
router.patch("/:id/delivery-person", requireAuth, requireAnyPermission("delivery:assign", "orders:updateStatus"), ordersController.assignDeliveryPerson);

module.exports = router;
