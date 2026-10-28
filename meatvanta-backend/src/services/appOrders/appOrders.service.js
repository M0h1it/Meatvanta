const prisma = require("../../config/db");
const ordersService = require("../orders/orders.service");
const orderAlerts = require("../push/orderAlerts.service");
const { writeAuditLog } = require("../../utils/auditLogger.util");

/**
 * What the order-alert app sees. Deliberately small: the order number, what is in it, the
 * amount, and where it stands. No customer details, no address, no payment details.
 */

const ACTIVE = orderAlerts.ACTIVE_STATUSES;
const OVERDUE_AFTER_MS = orderAlerts.STOP_RINGING_AFTER_MS; // 15 min without "Seen it"

// The only step the app offers for each status (forward only; cancelling stays in the admin panel).
const NEXT_STATUS = { placed: "preparing", preparing: "out_for_delivery", out_for_delivery: "delivered" };

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const amount = (n) => Number(n);

function isOverdue(order, now = Date.now()) {
  return !order.acknowledgedAt && ACTIVE.includes(order.status) && now - new Date(order.createdAt).getTime() > OVERDUE_AFTER_MS;
}

/** One row of the list. */
function toListItem(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    total: amount(order.total),
    itemsSummary: orderAlerts.itemsSummary(order.items),
    createdAt: order.createdAt,
    acknowledged: Boolean(order.acknowledgedAt),
    overdue: isOverdue(order),
  };
}

/** Full order for the detail screen: the items and the amount. */
function toDetail(order) {
  return {
    ...toListItem(order),
    items: order.items
      .filter((i) => i.quantity > 0)
      .map((i) => ({
        id: i.id,
        productName: i.productName,
        variantLabel: i.variantLabel,
        quantity: i.quantity,
        options: Array.isArray(i.selectedOptions) ? i.selectedOptions.map((o) => o.optionName) : [],
        lineTotal: amount(i.lineTotal),
      })),
    acknowledgedAt: order.acknowledgedAt,
    acknowledgedBy: order.acknowledgedBy ? order.acknowledgedBy.name : null,
    nextStatus: NEXT_STATUS[order.status] || null,
  };
}

const detailInclude = {
  items: { orderBy: { id: "asc" } },
  acknowledgedBy: { select: { id: true, name: true } },
};

/**
 * tab "new"    - customer orders nobody has tapped "Seen it" on yet, still in progress
 * tab "active" - everything still in progress (not delivered / cancelled)
 * Orders from before the app existed are all finished, so they never show up here.
 */
async function listOrders(tab) {
  const where =
    tab === "active"
      ? { status: { in: ACTIVE } }
      : { acknowledgedAt: null, createdByAdminId: null, status: { in: ACTIVE } };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { items: { orderBy: { id: "asc" } } },
  });
  return orders.map(toListItem);
}

async function getOrder(id) {
  const order = await prisma.order.findUnique({ where: { id }, include: detailInclude });
  if (!order) throw httpError(404, "Order not found.");
  return toDetail(order);
}

/**
 * "Seen it". Safe to call twice: only the first call counts and stops the siren on the other phones.
 * Never changes the order's status.
 */
async function acknowledge(id, admin, ipAddress) {
  const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw httpError(404, "Order not found.");

  const marked = await prisma.order.updateMany({
    where: { id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: admin.id },
  });

  if (marked.count === 1) {
    await writeAuditLog({
      adminId: admin.id,
      action: "device:access",
      entity: "Order",
      entityId: id,
      metadata: { event: "order_acknowledged" },
      ipAddress,
    });
    // Stop the siren on every phone, in the background - the answer to the app does not wait for it.
    orderAlerts.notifyAcknowledged(id);
  }
  return getOrder(id);
}

/**
 * Moves an order forward one step. The real rules live in ordersService.updateOrderStatus
 * (the same function the admin panel uses), so a wrong jump is refused exactly the same way.
 * Moving an order on also counts as having seen it, so the siren does not keep ringing on other phones.
 */
async function changeStatus(id, status, admin, ipAddress) {
  const order = await ordersService.updateOrderStatus(id, status, admin.id);

  await writeAuditLog({
    adminId: admin.id,
    action: "orders:updateStatus",
    entity: "Order",
    entityId: order.id,
    metadata: { status, via: "app" },
    ipAddress,
  });

  const marked = await prisma.order.updateMany({
    where: { id, acknowledgedAt: null },
    data: { acknowledgedAt: new Date(), acknowledgedById: admin.id },
  });
  if (marked.count === 1) orderAlerts.notifyAcknowledged(id);

  return getOrder(id);
}

module.exports = { listOrders, getOrder, acknowledge, changeStatus, NEXT_STATUS };
