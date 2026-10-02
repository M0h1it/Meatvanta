/**
 * Two ways to prove the phone number:
 *  - accessToken: issued by the MSG91 OTP Widget once the customer typed the
 *    right code (see customerAuth.service.js verifyOtp / msg91.service.js).
 *  - signupToken: issued by OUR backend right after that check, for a number
 *    that still needs a name. MSG91's access-token can only be checked once,
 *    so the "enter your name" step presents this instead of asking MSG91 again.
 */
function validateOtpVerification(body) {
  const errors = {};
  const { accessToken, signupToken, name } = body || {};

  const hasAccessToken = typeof accessToken === "string" && accessToken.trim().length >= 10;
  const hasSignupToken = typeof signupToken === "string" && signupToken.trim().length >= 10;

  if (!hasAccessToken && !hasSignupToken) {
    errors.accessToken = "Missing verification token.";
  }
  // name is optional - only required for a phone number with no account yet,
  // which the service decides since only it knows if the customer exists.
  if (name !== undefined && name !== null && typeof name !== "string") {
    errors.name = "Name must be text.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

module.exports = { validateOtpVerification };
