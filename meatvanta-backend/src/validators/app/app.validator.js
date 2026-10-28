const TABS = ["new", "active"];
// The app can only move an order FORWARD. Cancelling (which can mean giving money back) stays in the admin panel.
const APP_STATUSES = ["preparing", "out_for_delivery", "delivered"];

function validateAppLogin(body) {
  const errors = {};
  const { email, password, deviceName, fcmToken } = body || {};

  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    errors.email = "Enter a valid email.";
  }
  if (!password || typeof password !== "string") {
    errors.password = "Enter your password.";
  }
  if (deviceName !== undefined && deviceName !== null && (typeof deviceName !== "string" || deviceName.length > 120)) {
    errors.deviceName = "Device name must be 120 characters or fewer.";
  }
  if (fcmToken !== undefined && fcmToken !== null && (typeof fcmToken !== "string" || fcmToken.length > 512)) {
    errors.fcmToken = "Invalid push token.";
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateFcmToken(body) {
  const { fcmToken } = body || {};
  const errors = {};
  if (!fcmToken || typeof fcmToken !== "string" || fcmToken.length > 512) {
    errors.fcmToken = "A push token is required.";
  }
  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateTab(tab) {
  if (tab === undefined || tab === "") return { isValid: true, tab: "new" };
  return TABS.includes(tab) ? { isValid: true, tab } : { isValid: false, tab: null };
}

function validateAppStatus(body) {
  const { status } = body || {};
  if (status === "cancelled") {
    return { isValid: false, message: "Orders can only be cancelled from the admin panel." };
  }
  if (!APP_STATUSES.includes(status)) {
    return { isValid: false, message: `status must be one of: ${APP_STATUSES.join(", ")}` };
  }
  return { isValid: true };
}

module.exports = { TABS, APP_STATUSES, validateAppLogin, validateFcmToken, validateTab, validateAppStatus };
