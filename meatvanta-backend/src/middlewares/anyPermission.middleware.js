const { roleArrayHasPermission } = require("../utils/permission.util");
const { failure } = require("../utils/apiResponse.util");

/** Passes if the admin holds AT LEAST ONE of the given permissions. Runs after requireAuth. */
function requireAnyPermission(...permissionKeys) {
  return (req, res, next) => {
    const admin = req.admin;
    if (!admin) return failure(res, 401, "Not authenticated.");
    if (permissionKeys.some((key) => roleArrayHasPermission(admin.permissions, key))) return next();
    return failure(res, 403, "You don't have permission to do that.");
  };
}

module.exports = { requireAnyPermission };
