const prisma = require("../../config/db");

/**
 * Fire-and-forget - a notification failure must never break the action that
 * triggered it (an order is far more important than its alert). Same
 * defensive pattern as the audit logger.
 */
async function createNotification({ type, title, message, entityType = null, entityId = null }) {
  try {
    return await prisma.notification.create({
      data: { type, title, message, entityType, entityId },
    });
  } catch (err) {
    console.error("[notifications] failed to create notification:", err.message);
    return null;
  }
}

async function listNotifications({ unreadOnly = false, limit = 20 } = {}) {
  return prisma.notification.findMany({
    where: unreadOnly ? { isRead: false } : {},
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** The cheap endpoint the bell badge polls - a count, not a payload. */
async function getUnreadCount() {
  return prisma.notification.count({ where: { isRead: false } });
}

async function markAsRead(id) {
  const existing = await prisma.notification.findUnique({ where: { id } });
  if (!existing) {
    const err = new Error("Notification not found.");
    err.statusCode = 404;
    err.expose = true;
    throw err;
  }
  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
}

async function markAllAsRead() {
  const result = await prisma.notification.updateMany({
    where: { isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { markedCount: result.count };
}

// How far back an unacknowledged order alert is still worth shouting about.
const ORDER_ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Unread "new order" alerts with the order details, oldest first - what the
 * admin popup shows. Stays in the list until someone presses OK (which marks
 * the notification read), so a missed sound never means a missed order.
 */
async function listPendingOrderAlerts({ limit = 20 } = {}) {
  const alerts = await prisma.notification.findMany({
    where: {
      type: "new_order",
      isRead: false,
      entityType: "Order",
      entityId: { not: null },
      createdAt: { gte: new Date(Date.now() - ORDER_ALERT_WINDOW_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  if (alerts.length === 0) return [];

  const orders = await prisma.order.findMany({
    where: { id: { in: alerts.map((a) => a.entityId) } },
    include: { items: { orderBy: { id: "asc" } } },
  });
  const byId = new Map(orders.map((o) => [o.id, o]));

  const result = [];
  for (const alert of alerts) {
    const order = byId.get(alert.entityId);
    if (!order) continue;
    result.push({
      notificationId: alert.id,
      createdAt: alert.createdAt,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        subtotal: Number(order.subtotal),
        deliveryCharge: Number(order.deliveryCharge),
        discount: Number(order.discount),
        couponCode: order.couponCode,
        total: Number(order.total),
        deliveryDate: order.deliveryDate,
        deliveryStartTime: order.deliveryStartTime,
        deliveryEndTime: order.deliveryEndTime,
        notes: order.notes,
        items: order.items.map((i) => ({
          id: i.id,
          productName: i.productName,
          variantLabel: i.variantLabel,
          quantity: i.quantity,
          lineTotal: Number(i.lineTotal),
          selectedOptions: Array.isArray(i.selectedOptions) ? i.selectedOptions : [],
        })),
      },
    });
  }
  return result;
}

/**
 * The admin pressed OK on an order popup: mark that alert read, plus the
 * "payment received" alert of the same order (Razorpay creates both).
 */
async function acknowledgeOrderAlert(id) {
  const alert = await markAsRead(id);
  if (alert.entityId) {
    await prisma.notification.updateMany({
      where: { entityType: "Order", entityId: alert.entityId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }
  return alert;
}

module.exports = {
  listPendingOrderAlerts,
  acknowledgeOrderAlert, createNotification, listNotifications, getUnreadCount, markAsRead, markAllAsRead };
