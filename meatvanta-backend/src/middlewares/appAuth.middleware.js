const crypto = require("crypto");
const prisma = require("../config/db");
const { roleArrayHasPermission } = require("../utils/permission.util");
const { failure } = require("../utils/apiResponse.util");
const { appMode } = require("../utils/appMode.util");

const INACTIVE_DAYS = 90; // a phone not used for this long has to sign in again
const TOUCH_EVERY_MS = 5 * 60 * 1000; // lastSeenAt is written at most this often, not on every request

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Authentication for the Android order-alert app (/api/app/*).
 *
 * The app has its own long-lived bearer token. It is read from the Authorization header ONLY -
 * never from a cookie - so an admin or customer cookie can't be used here, and (the admin and
 * customer middlewares only read cookies) an app token can't be used there.
 *
 * The account is re-checked on EVERY request: if the admin is deactivated, the phone is logged out,
 * their password was changed, or their role lost `device:access`, the very next request fails with 401
 * and the app signs itself out.
 *
 * On success it sets req.admin in the same shape requireAuth does (so requirePermission works
 * unchanged) and req.appDevice.
 */
async function requireAppAuth(req, res, next) {
  try {
    const match = /^Bearer ([A-Za-z0-9]{64})$/.exec(req.headers.authorization || "");
    if (!match) return failure(res, 401, "Not signed in.");

    const device = await prisma.appDevice.findUnique({
      where: { tokenHash: hashToken(match[1]) },
      include: { adminUser: { include: { role: true } } },
    });
    if (!device || device.revokedAt) return failure(res, 401, "Not signed in.");

    const admin = device.adminUser;
    if (!admin.isActive || !admin.role) return failure(res, 401, "This account is not active.");
    if (!roleArrayHasPermission(admin.role.permissions, "device:access")) {
      return failure(res, 401, "This account is not allowed to use the app.");
    }
    // A password change ends every earlier session (same rule as the admin panel).
    if (admin.passwordChangedAt && admin.passwordChangedAt > device.createdAt) {
      return failure(res, 401, "Your password was changed. Please sign in again.");
    }

    const now = Date.now();
    const lastUsed = (device.lastSeenAt || device.createdAt).getTime();
    if (now - lastUsed > INACTIVE_DAYS * 24 * 60 * 60 * 1000) {
      await prisma.appDevice.update({ where: { id: device.id }, data: { revokedAt: new Date(), fcmToken: null } });
      return failure(res, 401, "Session expired. Please sign in again.");
    }
    if (!device.lastSeenAt || now - device.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      // Not worth failing a request over.
      prisma.appDevice.update({ where: { id: device.id }, data: { lastSeenAt: new Date(now) } }).catch(() => {});
    }

    req.admin = {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      roleId: admin.roleId,
      role: admin.role.name,
      permissions: admin.role.permissions,
    };
    req.appMode = appMode(admin.role.permissions);
    req.appDevice = { id: device.id };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Order list / acknowledge / status are for shop staff. A rider account gets 403 here, whatever its token. */
function requireAdminMode(req, res, next) {
  if (req.appMode === "rider") return failure(res, 403, "You do not have permission to do this.");
  return next();
}

module.exports = { requireAppAuth, requireAdminMode, hashToken };
