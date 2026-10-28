const fs = require("fs");
const prisma = require("../../config/db");

/**
 * Firebase Cloud Messaging, called straight from the backend (no Expo push service).
 *
 * Push is an extra: if Firebase is not configured or fails, orders must keep working. So nothing
 * in here throws into the caller - a missing / unreadable service-account file only logs a warning
 * (once) and every send becomes a no-op.
 */

let messaging = null;
let initFailed = false;

function warnOnce(message) {
  if (initFailed) return;
  initFailed = true;
  console.warn(`[push] ${message} - push notifications are switched off.`);
}

/** Lazily starts firebase-admin from FIREBASE_SERVICE_ACCOUNT_PATH. null when push is not available. */
function getMessaging() {
  if (messaging) return messaging;
  if (initFailed) return null;

  const file = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!file) {
    warnOnce("FIREBASE_SERVICE_ACCOUNT_PATH is not set");
    return null;
  }
  try {
    const admin = require("firebase-admin");
    const serviceAccount = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    }
    messaging = admin.messaging();
    return messaging;
  } catch (err) {
    warnOnce(`could not start Firebase (${err.message})`);
    return null;
  }
}

// Errors that mean "this phone's token is dead" - the token is cleared so it is not tried again.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const TTL_MS = 15 * 60 * 1000;

/**
 * Sends one data-only, high-priority message to many phones. Data-only so the app's background
 * handler always runs and draws the alarm itself. Every data value must be a string.
 * Returns { sent, failed }; never throws.
 */
async function sendToTokens(tokens, data) {
  const list = [...new Set((tokens || []).filter(Boolean))];
  if (list.length === 0) return { sent: 0, failed: 0 };

  const fcm = getMessaging();
  if (!fcm) return { sent: 0, failed: 0 };

  const payload = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));
  try {
    const response = await fcm.sendEachForMulticast({
      tokens: list,
      android: { priority: "high", ttl: TTL_MS },
      data: payload,
    });

    const dead = [];
    response.responses.forEach((r, i) => {
      if (!r.success && DEAD_TOKEN_CODES.has(r.error?.code)) dead.push(list[i]);
    });
    if (dead.length > 0) {
      await prisma.appDevice.updateMany({ where: { fcmToken: { in: dead } }, data: { fcmToken: null } });
    }
    return { sent: response.successCount, failed: response.failureCount };
  } catch (err) {
    console.error("[push] send failed:", err.message);
    return { sent: 0, failed: list.length };
  }
}

/** Test hook: lets a test script replace Firebase with a fake. Not used by the app itself. */
function _setMessagingForTests(fake) {
  messaging = fake;
  initFailed = false;
}

module.exports = { sendToTokens, _setMessagingForTests };
