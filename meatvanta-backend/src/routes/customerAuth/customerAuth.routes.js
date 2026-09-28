const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();

const controller = require("../../controllers/customerAuth/customerAuth.controller");
const addressController = require("../../controllers/customerAddresses/customerAddresses.controller");
const {
  requireCustomerAuth,
  CUSTOMER_ACCESS_COOKIE,
  CUSTOMER_REFRESH_COOKIE,
} = require("../../middlewares/customerAuth.middleware");
const { success } = require("../../utils/apiResponse.util");

/**
 * A browser with no session cookies at all is simply a guest: answer
 * "customer: null" (200) instead of a 401. Otherwise every guest page load
 * showed red 401s in the console and fired a pointless /refresh. A browser
 * that HAS cookies still goes through the normal check, so an expired access
 * token is refreshed exactly as before.
 */
function guestIfNoSession(req, res, next) {
  const cookies = req.cookies || {};
  if (!cookies[CUSTOMER_ACCESS_COOKIE] && !cookies[CUSTOMER_REFRESH_COOKIE]) {
    return success(res, 200, "Not signed in.", { customer: null });
  }
  return next();
}

// Sending/matching the OTP itself now happens entirely on MSG91's side (the
// widget talks to MSG91 directly from the browser) - this only rate-limits
// how often a browser can ask OUR backend to confirm an access-token.
const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please try again shortly.", errors: null },
});

router.post("/verify-otp", otpVerifyLimiter, controller.verifyOtp);
router.post("/refresh", controller.refresh);
router.post("/logout", controller.logout);
router.get("/me", guestIfNoSession, requireCustomerAuth, controller.me);

// Address book - every route is scoped to the signed-in customer.
router.get("/addresses", requireCustomerAuth, addressController.list);
router.post("/addresses", requireCustomerAuth, addressController.create);
router.put("/addresses/:id", requireCustomerAuth, addressController.update);
router.delete("/addresses/:id", requireCustomerAuth, addressController.remove);
router.patch("/addresses/:id/default", requireCustomerAuth, addressController.setDefault);

module.exports = router;