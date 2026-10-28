const express = require("express");
const router = express.Router();

const appAuthController = require("../../controllers/appAuth/appAuth.controller");
const appOrdersController = require("../../controllers/appOrders/appOrders.controller");
const deliveryController = require("../../controllers/delivery/delivery.controller");
const { requireAppAuth, requireAdminMode } = require("../../middlewares/appAuth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");
const { appLoginRateLimiter } = require("../../middlewares/rateLimiter.middleware");

// Everything for the Android order-alert app, mounted at /api/app. It has its own bearer-token
// login (requireAppAuth) - the admin cookie does not work here and the app token does not work
// under /api/admin.

router.post("/auth/login", appLoginRateLimiter, appAuthController.login);
router.post("/auth/logout", requireAppAuth, appAuthController.logout);
router.get("/auth/me", requireAppAuth, appAuthController.me);

router.put("/devices/fcm-token", requireAppAuth, appAuthController.updateFcmToken);

router.get("/orders", requireAppAuth, requireAdminMode, appOrdersController.list);
router.get("/orders/:id", requireAppAuth, requireAdminMode, appOrdersController.getOne);
router.post("/orders/:id/acknowledge", requireAppAuth, requireAdminMode, appOrdersController.acknowledge);
// Moving an order forward needs the same permission as in the admin panel.
router.patch("/orders/:id/status", requireAppAuth, requireAdminMode, requirePermission("orders:updateStatus"), appOrdersController.updateStatus);

// Rider side: the same service the admin panel's "My deliveries" page uses. Every call is limited to
// orders assigned to the signed-in rider (deliveryAdminId = their id); others look like "not found".
router.get("/rider/orders", requireAppAuth, requirePermission("delivery:view"), deliveryController.myOrders);
router.get("/rider/cash", requireAppAuth, requirePermission("delivery:view"), deliveryController.myCash);
router.post("/rider/orders/:id/pickup", requireAppAuth, requirePermission("delivery:updateStatus"), deliveryController.pickUp);
router.post("/rider/orders/:id/delivered", requireAppAuth, requirePermission("delivery:updateStatus"), deliveryController.deliver);
router.post("/rider/orders/:id/failed", requireAppAuth, requirePermission("delivery:updateStatus"), deliveryController.failed);

module.exports = router;
