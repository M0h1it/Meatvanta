const rateLimit = require("express-rate-limit");

// 8 attempts per 15 minutes per IP - tune later once you see real usage patterns.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in a few minutes.",
    errors: null,
  },
});

// The order-alert app signs in with the same admin passwords, so it gets the same limit - but its
// own counter, so staff logging in to the admin panel and the app from the same shop WiFi do not
// lock each other out.
const appLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again in a few minutes.",
    errors: null,
  },
});

// Coupon checks: generous for real shoppers, but stops scripts guessing codes.
const couponRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many coupon attempts. Please wait a few minutes and try again.",
    errors: null,
  },
});

// Cart/checkout price preview (runs whenever the cart or payment choice changes).
const previewRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please wait a moment and try again.",
    errors: null,
  },
});

module.exports = { loginRateLimiter, appLoginRateLimiter, couponRateLimiter, previewRateLimiter };
