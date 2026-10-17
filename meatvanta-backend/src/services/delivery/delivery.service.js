const prisma = require("../../config/db");
const ordersService = require("../orders/orders.service");
const notificationsService = require("../notifications/notifications.service");
const ist = require("../../utils/istDate.util");
const { orderMapUrl, hasPin } = require("../../utils/mapLink.util");
const couponsService = require("../coupons/coupons.service");
const wallet = require("../wallet/wallet.service");

// Cash the rider actually has to collect for an order: the bill minus whatever the
// customer already paid from their wallet (0 until wallet payment exists at checkout).
const cashDue = (order) => Math.max(0, Number(order.total) - Number(order.walletUsed || 0));

// The website promises delivery within 60-90 minutes; the deadline shown to the
// rider and the owner is the upper end. Change with DELIVERY_PROMISE_MAX_MINUTES.
const PROMISE_MAX_MINUTES = Number(process.env.DELIVERY_PROMISE_MAX_MINUTES) || 90;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * When must this order reach the customer?
 *  - ordered for today (or no date): order time + the promise (default 90 min)
 *  - booked for a later day: the end of that day's delivery window
 */
function computeDueBy(order) {
  const promiseDue = new Date(new Date(order.createdAt).getTime() + PROMISE_MAX_MINUTES * 60 * 1000);
  if (!order.deliveryDate || !order.deliveryEndTime) return promiseDue;

  const dateKey = new Date(order.deliveryDate).toISOString().slice(0, 10);
  if (dateKey <= ist.todayKey()) return promiseDue;

  const [h, m] = String(order.deliveryEndTime).split(":").map(Number);
  if (!Number.isFinite(h)) return promiseDue;
  return new Date(ist.startOfIstDay(dateKey).getTime() + ((h * 60) + (m || 0)) * 60 * 1000);
}

/** What a rider is allowed to see about an order - nothing about revenue, other orders or the customer's history. */
function riderView(order) {
  const dueBy = computeDueBy(order);
  const address = order.deliveryAddress || "";
  const total = Number(order.total);
  const terminal = order.status === "delivered" || order.status === "cancelled";
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryAddress: address,
    // The customer's exact map pin when there is one, otherwise a search for the address text.
    mapUrl: orderMapUrl(order),
    hasPin: hasPin(order),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    // What the rider must collect in cash. Online-paid orders: nothing.
    amountToCollect: order.paymentMethod === "cod" && order.paymentStatus !== "paid" ? cashDue(order) : 0,
    total,
    // Items the shop could not send are listed too ("Not sent"), so the rider is not
    // surprised by a smaller bill than the customer remembers.
    unavailableAmount: Number(order.unavailableAmount || 0),
    notes: order.notes,
    items: (order.items || []).map((i) => {
      const ordered = i.orderedQuantity ?? i.quantity;
      return {
        productName: i.productName,
        variantLabel: i.variantLabel,
        quantity: i.quantity,
        orderedQuantity: ordered,
        notSent: ordered - i.quantity,
        selectedOptions: Array.isArray(i.selectedOptions) ? i.selectedOptions : [],
      };
    }),
    dueBy,
    isOverdue: !terminal && dueBy.getTime() < Date.now(),
    canPickUp: order.status === "preparing",
    canDeliver: order.status === "out_for_delivery",
    waitingForShop: order.status === "placed",
    deliveryFailedReason: order.deliveryFailedReason,
    deliveryAttempts: order.deliveryAttempts || 0,
    createdAt: order.createdAt,
    deliveredAt: order.deliveredAt,
  };
}

/* ------------------------------ owner side ------------------------------ */

/** Admin users whose role carries the delivery permissions (explicitly, not via "*"). */
async function listRiders() {
  const admins = await prisma.adminUser.findMany({
    where: { isActive: true },
    include: { role: true },
    orderBy: { name: "asc" },
  });
  return admins
    .filter((a) => Array.isArray(a.role?.permissions) && (a.role.permissions.includes("delivery:view") || a.role.permissions.includes("delivery:*")))
    .map((a) => ({ id: a.id, name: a.name, phone: a.phone || null }));
}

/** deliveryAdminId = null removes the rider. */
async function assignRider(orderId, deliveryAdminId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw httpError(404, "Order not found.");
  if (order.status === "delivered" || order.status === "cancelled") {
    throw httpError(400, `A ${order.status} order cannot be reassigned.`);
  }

  if (deliveryAdminId === null) {
    return prisma.order.update({
      where: { id: orderId },
      data: { deliveryAdminId: null, deliveryPersonName: null, deliveryPersonPhone: null, deliveryAssignedAt: null, deliveryFailedReason: null },
      include: ordersService.orderInclude,
    });
  }

  const riders = await listRiders();
  const rider = riders.find((r) => r.id === deliveryAdminId);
  if (!rider) throw httpError(400, "That person is not an active delivery rider.");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryAdminId: rider.id,
      deliveryPersonName: rider.name,
      deliveryPersonPhone: rider.phone,
      deliveryAssignedAt: new Date(),
      deliveryFailedReason: null,
    },
    include: ordersService.orderInclude,
  });

  if (order.deliveryAdminId !== rider.id) {
    await notificationsService.createNotification({
      type: "order_assigned",
      title: "New delivery for you",
      message: `${order.orderNumber} - ${order.customerName}`,
      entityType: "Order",
      entityId: order.id,
      adminUserId: rider.id,
    });
  }
  return updated;
}

/* ------------------------------ rider side ------------------------------- */

async function getOwnedOrder(adminId, orderId) {
  // "Not yours" and "does not exist" look identical on purpose.
  const order = await prisma.order.findFirst({
    where: { id: orderId, deliveryAdminId: adminId },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!order) throw httpError(404, "Order not found.");
  return order;
}

async function listMyOrders(adminId) {
  const [active, done] = await Promise.all([
    prisma.order.findMany({
      where: { deliveryAdminId: adminId, status: { in: ["placed", "preparing", "out_for_delivery"] } },
      include: { items: { orderBy: { id: "asc" } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: { deliveryAdminId: adminId, status: "delivered", deliveredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: { items: { orderBy: { id: "asc" } } },
      orderBy: { deliveredAt: "desc" },
      take: 20,
    }),
  ]);
  // Closest deadline first - that is the order to deliver next.
  const activeViews = active.map(riderView).sort((a, b) => a.dueBy - b.dueBy);
  return { active: activeViews, delivered: done.map(riderView) };
}

async function markPickedUp(adminId, orderId) {
  const order = await getOwnedOrder(adminId, orderId);
  if (order.status === "placed") throw httpError(400, "The shop has not finished preparing this order yet.");
  if (order.status !== "preparing") throw httpError(400, "This order is not waiting for pickup.");
  await ordersService.updateOrderStatus(orderId, "out_for_delivery");
  await prisma.order.update({ where: { id: orderId }, data: { pickedUpAt: new Date(), deliveryFailedReason: null } });
  return riderView(await getOwnedOrder(adminId, orderId));
}

async function markDelivered(adminId, orderId) {
  const order = await getOwnedOrder(adminId, orderId);
  if (order.status !== "out_for_delivery") throw httpError(400, "Pick the order up first.");
  // The shared status update also marks COD orders as paid and stamps deliveredAt.
  await ordersService.updateOrderStatus(orderId, "delivered");
  return riderView(await getOwnedOrder(adminId, orderId));
}

async function reportFailed(adminId, orderId, reason) {
  const order = await getOwnedOrder(adminId, orderId);
  if (order.status !== "out_for_delivery") throw httpError(400, "Only an order that is out for delivery can be reported.");
  const text = typeof reason === "string" ? reason.trim().slice(0, 255) : "";
  if (text.length < 3) throw httpError(422, "Please write a short reason.");

  await prisma.order.update({
    where: { id: orderId },
    data: { deliveryFailedReason: text, deliveryFailedAt: new Date(), deliveryAttempts: { increment: 1 } },
  });
  // Shop-wide alert (adminUserId null) so the owner sees it in the bell.
  await notificationsService.createNotification({
    type: "delivery_failed",
    title: "Delivery problem",
    message: `${order.orderNumber}: ${text}`,
    entityType: "Order",
    entityId: orderId,
  });
  return riderView(await getOwnedOrder(adminId, orderId));
}


/* ---------------------- failed delivery: what the owner does next ---------------------- */

async function getFailedOrder(orderId) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw httpError(404, "Order not found.");
  if (order.status !== "out_for_delivery" || !order.deliveryFailedReason) {
    throw httpError(400, "This order has no failed delivery waiting for a decision.");
  }
  return order;
}

/**
 * "Send again". No riderId (or the same rider) = the same rider tries once more,
 * the order stays out for delivery. A different rider = the order goes back to
 * "ready for pickup" for that rider.
 */
async function retryDelivery(orderId, riderId) {
  const order = await getFailedOrder(orderId);
  const sameRider = riderId === undefined || riderId === null || riderId === order.deliveryAdminId;

  if (sameRider) {
    if (!order.deliveryAdminId) throw httpError(400, "Pick a rider to send this order with.");
    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { deliveryFailedReason: null },
      include: ordersService.orderInclude,
    });
    await notificationsService.createNotification({
      type: "order_assigned",
      title: "Try this delivery again",
      message: `${order.orderNumber} - ${order.customerName}`,
      entityType: "Order",
      entityId: order.id,
      adminUserId: order.deliveryAdminId,
    });
    return updated;
  }

  const riders = await listRiders();
  const rider = riders.find((r) => r.id === riderId);
  if (!rider) throw httpError(400, "That person is not an active delivery rider.");

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: {
      deliveryAdminId: rider.id,
      deliveryPersonName: rider.name,
      deliveryPersonPhone: rider.phone,
      deliveryAssignedAt: new Date(),
      pickedUpAt: null,
      status: "preparing", // goes back to the shop counter for the new rider to collect
      deliveryFailedReason: null,
    },
    include: ordersService.orderInclude,
  });
  await notificationsService.createNotification({
    type: "order_assigned",
    title: "New delivery for you",
    message: `${order.orderNumber} - ${order.customerName}`,
    entityType: "Order",
    entityId: order.id,
    adminUserId: rider.id,
  });
  return updated;
}

/**
 * Gives up on a failed delivery. Whatever the customer already paid goes to their wallet
 * (no manual Razorpay refund any more). `walletCredited` is what was credited now;
 * `creditSkipped` is only non-zero when the order has no usable phone number.
 */
async function cancelFailedDelivery(orderId, adminId = null) {
  const order = await getFailedOrder(orderId);
  let refund = { credited: 0, skipped: 0 };
  const updated = await prisma.$transaction(async (tx) => {
    await couponsService.releaseRedemption(tx, orderId);
    refund = await wallet.creditForCancel(tx, order, adminId);
    return tx.order.update({
      where: { id: orderId },
      data: { status: "cancelled" },
      include: ordersService.orderInclude,
    });
  });
  return {
    order: updated,
    refundNeeded: refund.skipped > 0, // only when the wallet credit was impossible
    walletCredited: refund.credited,
    creditSkipped: refund.skipped,
  };
}

/* ------------------------------ cash hand-over ------------------------------ */

// Cash a rider collected at the door and has not yet handed to the shop.
const OUTSTANDING_CASH = {
  paymentMethod: "cod",
  paymentStatus: "paid",
  status: "delivered",
  deliveryAdminId: { not: null },
  cashSettledAt: null,
};

/** Owner view: per rider, how much cash they are holding, with the orders behind it. */
async function cashSummary() {
  const [outstanding, recent] = await Promise.all([
    prisma.order.findMany({
      where: OUTSTANDING_CASH,
      select: {
        id: true, orderNumber: true, total: true, walletUsed: true, deliveredAt: true, customerName: true,
        deliveryAdminId: true, deliveryPersonName: true, deliveryPersonPhone: true,
      },
      orderBy: { deliveredAt: "asc" },
    }),
    prisma.order.findMany({
      where: { paymentMethod: "cod", cashSettledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, deliveryAdminId: { not: null } },
      select: { id: true, orderNumber: true, total: true, walletUsed: true, cashSettledAt: true, cashSettledByName: true, deliveryPersonName: true },
      orderBy: { cashSettledAt: "desc" },
      take: 30,
    }),
  ]);

  const byRider = new Map();
  for (const o of outstanding) {
    // Paid up front (wallet): nothing was collected at the door, so nothing to hand over.
    if (cashDue(o) <= 0) continue;
    if (!byRider.has(o.deliveryAdminId)) {
      byRider.set(o.deliveryAdminId, {
        riderId: o.deliveryAdminId,
        riderName: o.deliveryPersonName,
        riderPhone: o.deliveryPersonPhone,
        amount: 0,
        orders: [],
      });
    }
    const row = byRider.get(o.deliveryAdminId);
    const cash = cashDue(o);
    row.amount += cash;
    row.orders.push({
      id: o.id, orderNumber: o.orderNumber, total: cash, deliveredAt: o.deliveredAt, customerName: o.customerName,
    });
  }
  const riders = [...byRider.values()]
    .map((r) => ({ ...r, count: r.orders.length, oldestDeliveredAt: r.orders[0]?.deliveredAt || null }))
    .sort((a, b) => b.amount - a.amount);

  return {
    riders,
    totalHeld: riders.reduce((sum, r) => sum + r.amount, 0),
    recentlySettled: recent.map((o) => ({ ...o, total: cashDue(o) })),
  };
}

/** What the logged-in rider is carrying. */
async function myCash(adminId) {
  const orders = await prisma.order.findMany({
    where: { ...OUTSTANDING_CASH, deliveryAdminId: adminId },
    select: { total: true, walletUsed: true },
  });
  const withCash = orders.filter((o) => cashDue(o) > 0);
  return { amount: withCash.reduce((sum, o) => sum + cashDue(o), 0), count: withCash.length };
}

/**
 * The owner confirms the rider handed the cash over. orderIds limits it to some
 * orders (for a part-payment); leave it out to settle everything the rider holds.
 */
async function settleCash({ riderId, orderIds, receivedByName }) {
  if (!Number.isInteger(riderId) || riderId <= 0) throw httpError(422, "Pick a rider.");

  return prisma.$transaction(async (tx) => {
    const where = { ...OUTSTANDING_CASH, deliveryAdminId: riderId };
    if (Array.isArray(orderIds) && orderIds.length > 0) where.id = { in: orderIds.map(Number).filter(Number.isInteger) };

    const rows = await tx.order.findMany({ where, select: { id: true, total: true, walletUsed: true } });
    if (rows.length === 0) throw httpError(400, "There is no cash left to settle for this rider.");

    const result = await tx.order.updateMany({
      where: { id: { in: rows.map((r) => r.id) }, cashSettledAt: null },
      data: { cashSettledAt: new Date(), cashSettledByName: receivedByName || null },
    });
    return {
      settledCount: result.count,
      amount: rows.reduce((sum, r) => sum + cashDue(r), 0),
    };
  });
}

module.exports = {
  computeDueBy, riderView, listRiders, assignRider, listMyOrders, markPickedUp, markDelivered, reportFailed,
  retryDelivery, cancelFailedDelivery, cashSummary, myCash, settleCash,
};
