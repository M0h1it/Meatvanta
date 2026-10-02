const express = require("express");
const router = express.Router();

const notificationsController = require("../../controllers/notifications/notifications.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

// Specific path first so it doesn't collide with /:id patterns.
router.get("/unread-count", requireAuth, requirePermission("notifications:view"), notificationsController.unreadCount);

// New-order popup: the order details are shown, so orders:view is needed too.
router.get(
  "/pending-orders",
  requireAuth,
  requirePermission("notifications:view"),
  requirePermission("orders:view"),
  notificationsController.pendingOrders
);
router.patch(
  "/:id/ack-order",
  requireAuth,
  requirePermission("notifications:update"),
  notificationsController.acknowledgeOrder
);

router.get("/", requireAuth, requirePermission("notifications:view"), notificationsController.list);
router.patch("/:id/read", requireAuth, requirePermission("notifications:update"), notificationsController.markRead);
router.post("/read-all", requireAuth, requirePermission("notifications:update"), notificationsController.markAllRead);

module.exports = router;
