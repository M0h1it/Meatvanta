const express = require("express");
const router = express.Router();

const walletController = require("../../controllers/wallet/wallet.controller");
const { requireAuth } = require("../../middlewares/auth.middleware");
const { requirePermission } = require("../../middlewares/permission.middleware");

// What the shop owes its customers in wallet balance - a financial report, so it sits
// behind the same permission as the other reports.
router.get("/summary", requireAuth, requirePermission("reports:view"), walletController.adminSummary);
router.get("/accounts", requireAuth, requirePermission("reports:view"), walletController.adminAccounts);

module.exports = router;
