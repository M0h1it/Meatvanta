const express = require("express");
const router = express.Router();

const authRoutes = require("./auth/auth.routes");
const rolesRoutes = require("./roles/roles.routes");
const adminUsersRoutes = require("./adminUsers/adminUsers.routes");
const categoriesRoutes = require("./categories/categories.routes");
const productsRoutes = require("./products/products.routes");
const auditLogRoutes = require("./auditLog/auditLog.routes");
const ordersRoutes = require("./orders/orders.routes");
const deliverySettingsRoutes = require("./deliverySettings/deliverySettings.routes");
const notificationsRoutes = require("./notifications/notifications.routes");
const customersRoutes = require("./customers/customers.routes");
const shopInfoRoutes = require("./shopInfo/shopInfo.routes");
const analyticsRoutes = require("./analytics/analytics.routes");
const bannersRoutes = require("./banners/banners.routes");
const couponsRoutes = require("./coupons/coupons.routes");
const recipesRoutes = require("./recipes/recipes.routes");

router.use("/auth", authRoutes);
router.use("/roles", rolesRoutes);
router.use("/admin-users", adminUsersRoutes);
router.use("/categories", categoriesRoutes);
router.use("/products", productsRoutes);
router.use("/audit-log", auditLogRoutes);
router.use("/orders", ordersRoutes);
router.use("/delivery-settings", deliverySettingsRoutes);
router.use("/notifications", notificationsRoutes);
router.use("/customers", customersRoutes);
router.use("/shop-info", shopInfoRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/banners", bannersRoutes);
router.use("/coupons", couponsRoutes);
router.use("/recipes", recipesRoutes);

module.exports = router;
