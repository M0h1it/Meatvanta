const crypto = require("crypto");
const prisma = require("../../config/db");
const authService = require("../auth/auth.service");
const { roleArrayHasPermission } = require("../../utils/permission.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");
const { hashToken } = require("../../middlewares/appAuth.middleware");
const { appMode } = require("../../utils/appMode.util");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function publicUser(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    permissions: admin.role.permissions,
    mode: appMode(admin.role.permissions), // "admin" -> order alerts + orders, "rider" -> own deliveries
  };
}

/**
 * Signs a phone in. Same email + password as the admin panel, but the app gets its OWN long-lived
 * bearer token: 32 random bytes, returned once, only its sha256 is stored.
 * The account needs `device:access`; without it: 403.
 */
async function login({ email, password, deviceName, fcmToken, ipAddress }) {
  // Wrong password / inactive account -> the same generic 401 the admin panel gives.
  const admin = await authService.verifyAdminCredentials({ email: email.trim(), password, ipAddress });

  if (!roleArrayHasPermission(admin.role.permissions, "device:access")) {
    throw httpError(403, "This account is not allowed to use the app.");
  }

  const token = crypto.randomBytes(32).toString("hex");
  const name = deviceName ? deviceName.trim() : null;

  const device = await prisma.$transaction(async (tx) => {
    // The same push address can belong to one phone only.
    if (fcmToken) await tx.appDevice.updateMany({ where: { fcmToken }, data: { fcmToken: null } });
    // Signing in again on the same phone replaces its old sign-in instead of piling up rows.
    if (name) {
      await tx.appDevice.updateMany({
        where: { adminUserId: admin.id, deviceName: name, revokedAt: null },
        data: { revokedAt: new Date(), fcmToken: null },
      });
    }
    return tx.appDevice.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashToken(token),
        fcmToken: fcmToken || null,
        deviceName: name,
        lastSeenAt: new Date(),
      },
    });
  });

  await writeAuditLog({
    adminId: admin.id,
    action: "device:access",
    entity: "AppDevice",
    entityId: device.id,
    metadata: { event: "app_login", deviceName: name },
    ipAddress,
  });

  return { token, user: publicUser(admin) };
}

/** Signs this phone out: the token stops working and the phone stops receiving pushes. */
async function logout({ adminId, deviceId, ipAddress }) {
  await prisma.appDevice.update({ where: { id: deviceId }, data: { revokedAt: new Date(), fcmToken: null } });
  await writeAuditLog({
    adminId,
    action: "device:access",
    entity: "AppDevice",
    entityId: deviceId,
    metadata: { event: "app_logout" },
    ipAddress,
  });
}

async function getMe(adminId) {
  const admin = await prisma.adminUser.findUnique({ where: { id: adminId }, include: { role: true } });
  return publicUser(admin);
}

/** Called after login and whenever Firebase hands the phone a new token. */
async function setFcmToken({ deviceId, fcmToken }) {
  await prisma.$transaction(async (tx) => {
    await tx.appDevice.updateMany({ where: { fcmToken, NOT: { id: deviceId } }, data: { fcmToken: null } });
    await tx.appDevice.update({ where: { id: deviceId }, data: { fcmToken } });
  });
}

module.exports = { login, logout, getMe, setFcmToken };
