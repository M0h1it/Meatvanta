const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// Deliberately a different secret from the admin's. If they shared one, an
// admin token would authenticate as a customer and vice versa.
const CUSTOMER_JWT_SECRET = process.env.CUSTOMER_JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.CUSTOMER_ACCESS_EXPIRES_IN || "1h";

if (!CUSTOMER_JWT_SECRET) {
  throw new Error("CUSTOMER_JWT_SECRET is not set in environment variables.");
}

function signCustomerAccessToken(payload) {
  // payload: { id } - nothing else is trusted from the token; the middleware
  // re-reads the customer from the DB on every request.
  return jwt.sign(payload, CUSTOMER_JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN });
}

function verifyCustomerAccessToken(token) {
  const payload = jwt.verify(token, CUSTOMER_JWT_SECRET); // throws if invalid/expired
  // Same secret is used for the short-lived signup token below - make sure that
  // one can never be presented as a login session.
  if (payload.purpose) throw new Error("Not an access token.");
  return payload;
}

// Handed out once MSG91 has confirmed a phone number that has no account yet
// and we still need the customer's name. MSG91's access-token is single use, so
// the second step (name) must not ask MSG91 again - it presents this instead.
const SIGNUP_TOKEN_EXPIRES_IN = "10m";

function signSignupToken(phone) {
  return jwt.sign({ purpose: "signup", phone }, CUSTOMER_JWT_SECRET, { expiresIn: SIGNUP_TOKEN_EXPIRES_IN });
}

/** Returns the verified phone number. Throws if invalid, expired or the wrong kind of token. */
function verifySignupToken(token) {
  const payload = jwt.verify(token, CUSTOMER_JWT_SECRET);
  if (payload.purpose !== "signup" || !/^\d{10}$/.test(String(payload.phone || ""))) {
    throw new Error("Not a signup token.");
  }
  return payload.phone;
}

/** Refresh tokens are opaque random strings, not JWTs - they only need to be
 *  unguessable and revocable, and we store only their hash. */
function generateRefreshToken() {
  return crypto.randomBytes(48).toString("hex");
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = {
  signCustomerAccessToken,
  verifyCustomerAccessToken,
  signSignupToken,
  verifySignupToken,
  generateRefreshToken,
  hashRefreshToken,
};
