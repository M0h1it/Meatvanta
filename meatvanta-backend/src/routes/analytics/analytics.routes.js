const express = require("express");
const router = express.Router();

const analyticsController = require("../../controllers/analytics/analytics.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

// Sales figures are sensitive, so this needs the existing "reports:view"
// permission (the Owner role has it through "*"; give it to other roles in Roles).
router.get("/", requireAuth, requirePermission("reports:view"), analyticsController.getAnalytics);

module.exports = router;
