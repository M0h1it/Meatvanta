const prisma = require("../../config/db");
const { sendToTokens } = require("./fcm.service");
const { roleArrayHasPermission } = require("../../utils/permission.util");
const { appMode } = require("../../utils/appMode.util");

/**
 * The siren: a push to every phone signed in to the order-alert app when a real order arrives.
 *
 * - notifyNewOrder  - right after a COD / wallet order is created, and after a Razorpay payment is
 *                     verified (see notifyNewOrder in orders.service.js). Never for an unpaid
 *                     Razorpay draft, never for an order staff typed in themselves.
 * - notifyAcknowledged - tells the other phones to stop ringing.
 * - startReRingJob  - nobody tapped "Seen it": ring again every 2 minutes, for up to 15 minutes.
 *
 * Everything here is best-effort and must never fail or slow down an order.
 */

const RE_RING_AFTER_MS = 2 * 60 * 1000;
const STOP_RINGING_AFTER_MS = 15 * 60 * 1000;
const ACTIVE_STATUSES = ["placed", "preparing", "out_for_delivery"];

/** Push addresses of shop-staff phones: account active, has device:access, and is not a rider-only account. */
async function recipientTokens() {
  const devices = await prisma.appDevice.findMany({
    where: { revokedAt: null, fcmToken: { not: null }, adminUser: { isActive: true } },
    select: { fcmToken: true, adminUser: { select: { role: { select: { permissions: true } } } } },
  });
  return devices
    .filter((d) => roleArrayHasPermission(d.adminUser.role?.permissions, "device:access"))
    .filter((d) => appMode(d.adminUser.role?.permissions) === "admin")
    .map((d) => d.fcmToken);
}

/** "2× Chicken Curry Cut 500 GM, 1× Mutton Keema 500 GM" - only what will really be sent. */
function itemsSummary(items = []) {
  return items
    .filter((i) => i.quantity > 0)
    .map((i) => `${i.quantity}× ${i.productName} ${i.variantLabel}`.trim())
    .join(", ")
    .slice(0, 400);
}

/** 189 -> "189", 189.5 -> "189.50" */
function formatAmount(total) {
  const n = Number(total);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/** The data part of the "new order" push (all strings). Order number, items and amount - nothing else. */
function newOrderData(order) {
  return {
    type: "new_order",
    orderId: String(order.id),
    orderNumber: order.orderNumber,
    total: formatAmount(order.total),
    itemsSummary: itemsSummary(order.items),
    createdAt: new Date(order.createdAt).toISOString(),
  };
}

async function sendNewOrder(order) {
  const tokens = await recipientTokens();
  if (tokens.length === 0) return { sent: 0, failed: 0 };
  const result = await sendToTokens(tokens, newOrderData(order));
  // Remember when we last rang, so the re-ring job waits 2 minutes from here.
  await prisma.order.update({ where: { id: order.id }, data: { lastAlertSentAt: new Date() } });
  return result;
}

/** Fire-and-forget safe: catches its own errors. `order` needs its items (orderInclude has them). */
async function notifyNewOrder(order) {
  try {
    return await sendNewOrder(order);
  } catch (err) {
    console.error("[push] new-order alert failed:", err.message);
    return { sent: 0, failed: 0 };
  }
}

/** Someone tapped "Seen it": stop the siren on every phone. */
async function notifyAcknowledged(orderId) {
  try {
    const tokens = await recipientTokens();
    return await sendToTokens(tokens, { type: "order_ack", orderId: String(orderId) });
  } catch (err) {
    console.error("[push] acknowledge message failed:", err.message);
    return { sent: 0, failed: 0 };
  }
}

let running = false;

/** One pass of the re-ring job (exported so it can be run on demand). Returns how many orders rang again. */
async function runReRing(now = new Date()) {
  if (running) return 0;
  running = true;
  try {
    const orders = await prisma.order.findMany({
      where: {
        acknowledgedAt: null,
        createdByAdminId: null, // customer orders only - staff typed their own in
        status: { in: ACTIVE_STATUSES },
        createdAt: { gte: new Date(now.getTime() - STOP_RINGING_AFTER_MS) },
        OR: [{ lastAlertSentAt: null }, { lastAlertSentAt: { lt: new Date(now.getTime() - RE_RING_AFTER_MS) } }],
      },
      include: { items: { orderBy: { id: "asc" } } },
      take: 20,
    });

    let rang = 0;
    for (const order of orders) {
      const result = await notifyNewOrder(order);
      if (result.sent > 0) rang += 1;
    }
    return rang;
  } catch (err) {
    console.error("[push] re-ring job failed:", err.message);
    return 0;
  } finally {
    running = false;
  }
}

/** Starts the once-a-minute re-ring loop. One backend process, so an in-process timer is enough. */
function startReRingJob() {
  setInterval(() => runReRing(), 60 * 1000).unref();
}

module.exports = {
  RE_RING_AFTER_MS,
  STOP_RINGING_AFTER_MS,
  ACTIVE_STATUSES,
  itemsSummary,
  newOrderData,
  notifyNewOrder,
  notifyAcknowledged,
  runReRing,
  startReRingJob,
};
