// Push check for the order-alert app. Run on the server:  node scripts/push-check.js
// Read-only: uses Firebase "dry run", so no phone rings. Prints what is missing.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");
const prisma = require("../src/config/db");
(async () => {
  const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  console.log("1. FIREBASE_SERVICE_ACCOUNT_PATH:", path ? "set" : "NOT SET  <-- this is the problem");
  if (!path) process.exit(1);
  let cred;
  try { cred = require(path); } catch (e) { console.log("   cannot read the file:", e.message); process.exit(1); }
  console.log("2. service account file readable, project:", cred.project_id);
  const messaging = getMessaging(initializeApp({ credential: cert(cred) }));
  const devices = await prisma.appDevice.findMany({
    where: { revokedAt: null },
    select: { deviceName: true, fcmToken: true, adminUser: { select: { email: true } } },
    orderBy: { id: "desc" }, take: 10,
  });
  console.log("3. signed-in phones:", devices.length, "| with a push token:", devices.filter((d) => d.fcmToken).length);
  for (const d of devices) {
    if (!d.fcmToken) { console.log("   -", d.deviceName, d.adminUser.email, "-> NO push token saved"); continue; }
    try { await messaging.send({ token: d.fcmToken, data: { type: "noop" } }, true); console.log("   -", d.deviceName, d.adminUser.email, "-> token OK"); }
    catch (e) { console.log("   -", d.deviceName, d.adminUser.email, "-> FAIL", e.code); }
  }
  // Real credentials check: a dry-run to a fake token must be rejected as a bad TOKEN, not as bad credentials.
  try { await messaging.send({ token: "x".repeat(150), data: { type: "noop" } }, true); }
  catch (e) { console.log("4. Google accepted our credentials:", /invalid|registration|argument/i.test(e.code + e.message) ? "YES" : "NO -> " + e.code); }
  process.exit(0);
})().catch((e) => { console.log("error:", e.message); process.exit(1); });
