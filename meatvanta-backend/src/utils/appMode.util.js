const { roleArrayHasPermission } = require("./permission.util");

/**
 * Which half of the Android app an account sees.
 *  - "rider": can see deliveries (`delivery:view`) but has nothing to do with running orders
 *             (no `orders:view`, no `orders:updateStatus`) -> only the rider's own deliveries.
 *  - "admin": everyone else with `device:access` (owner "*", manager, order staff) -> order alerts + order list.
 * Both need `device:access`; the caller checks that first.
 */
function appMode(permissions) {
  const runsOrders =
    roleArrayHasPermission(permissions, "orders:view") || roleArrayHasPermission(permissions, "orders:updateStatus");
  if (!runsOrders && roleArrayHasPermission(permissions, "delivery:view")) return "rider";
  return "admin";
}

module.exports = { appMode };
