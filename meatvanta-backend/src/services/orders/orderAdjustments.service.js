const prisma = require("../../config/db");
const couponsService = require("../coupons/coupons.service");
const notificationsService = require("../notifications/notifications.service");
const ordersService = require("./orders.service");
const wallet = require("../wallet/wallet.service");

const { round2 } = wallet;

/**
 * "Item just ran out": the shop sends what it has and drops the rest from the order.
 *
 * Rules (agreed with the shop owner):
 *  - Only while the order is still with the shop (placed / preparing). Once the rider
 *    has picked it up the parcel is what it is.
 *  - Partial quantity is allowed: 3 ordered, 2 available -> availableQuantity 2.
 *  - The coupon is left exactly as it was. The bill is recomputed with the same discount:
 *        total = max(0, subtotal - unavailable + deliveryCharge - discount)
 *  - Paid orders: the difference goes to the customer's wallet (phone number).
 *    Cash on delivery: the total simply gets smaller, the rider collects less.
 *  - Everything dropped -> the order is cancelled and everything paid is given back.
 *  - All of it happens in one transaction: the items, the order totals and the wallet
 *    credit change together or not at all.
 */

const ADJUSTABLE_STATUSES = ["placed", "preparing"];

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * @param {number} orderId
 * @param {Array<{itemId:number, availableQuantity:number}>} changes
 * @param {{id:number, name:string}} admin
 */
async function markItemsUnavailable(orderId, changes, admin) {
  if (!Array.isArray(changes) || changes.length === 0) {
    throw httpError(422, "Pick at least one item.");
  }
  if (changes.length > 100) throw httpError(422, "Too many items in one change.");

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw httpError(404, "Order not found.");
    if (!ADJUSTABLE_STATUSES.includes(order.status)) {
      throw httpError(400, 'Items can only be changed while the order is "placed" or "preparing".');
    }

    const byId = new Map(order.items.map((i) => [i.id, i]));
    const seen = new Set();
    const lines = [];
    let removedValue = 0;

    for (const change of changes) {
      const item = byId.get(Number(change?.itemId));
      if (!item) throw httpError(400, "One of the items is not part of this order.");
      if (seen.has(item.id)) throw httpError(422, "The same item was sent twice.");
      seen.add(item.id);

      const available = change.availableQuantity;
      if (!Number.isInteger(available) || available < 0 || available > item.quantity) {
        throw httpError(422, `"${item.productName}": available quantity must be a whole number from 0 to ${item.quantity}.`);
      }
      const removedQty = item.quantity - available;
      if (removedQty === 0) continue; // untouched line

      const unit = Number(item.unitPrice) + Number(item.optionsTotal);
      removedValue += unit * removedQty;
      lines.push({ item, available, removedQty, unit });
    }
    if (lines.length === 0) {
      throw httpError(422, "Nothing to change - lower the available quantity of at least one item.");
    }

    for (const l of lines) {
      await tx.orderItem.update({
        where: { id: l.item.id },
        data: {
          // keep the ORIGINAL ordered quantity the first time a line is touched
          orderedQuantity: l.item.orderedQuantity ?? l.item.quantity,
          quantity: l.available,
          lineTotal: round2(l.unit * l.available),
        },
      });
    }

    const stillSending = order.items.some((i) => {
      const line = lines.find((l) => l.item.id === i.id);
      return (line ? line.available : i.quantity) > 0;
    });

    // ---- everything dropped: cancel and give back everything paid ----
    if (!stillSending) {
      await couponsService.releaseRedemption(tx, order.id);
      const refund = await wallet.creditForCancel(tx, order, admin.id);
      if (refund.skipped > 0) {
        throw httpError(422, "This order's phone number is not a valid 10-digit number, so the wallet credit is not possible.");
      }
      const cancelled = await tx.order.update({
        where: { id: order.id },
        data: { status: "cancelled", unavailableAmount: round2(Number(order.subtotal)) },
        include: ordersService.orderInclude,
      });
      return { order: cancelled, credited: refund.credited, cancelled: true, previousTotal: Number(order.total) };
    }

    // ---- some items still go: new bill, same discount ----
    const unavailableAmount = round2(Number(order.unavailableAmount) + removedValue);
    const newTotal = round2(
      Math.max(0, Number(order.subtotal) - unavailableAmount + Number(order.deliveryCharge) - Number(order.discount))
    );

    const paid = wallet.paidSoFar(order);
    const shouldHaveBeenCredited = round2(Math.max(0, paid - newTotal));
    const delta = round2(Math.max(0, shouldHaveBeenCredited - Number(order.walletCredited || 0)));

    if (delta > 0) {
      await wallet.credit(tx, {
        phone: await wallet.walletPhoneFor(tx, order),
        amount: delta,
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: `Item not available in ${order.orderNumber}`,
        adminId: admin.id,
      });
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        unavailableAmount,
        total: newTotal,
        ...(delta > 0 ? { walletCredited: { increment: delta } } : {}),
      },
      include: ordersService.orderInclude,
    });
    return { order: updated, credited: delta, cancelled: false, previousTotal: Number(order.total) };
  });

  // Tell the rider (if one is assigned) that the bill changed - outside the transaction on
  // purpose: a failed notification must never undo the order change.
  const rider = result.order.deliveryAdminId;
  if (rider) {
    const o = result.order;
    await notificationsService.createNotification({
      type: "order_adjusted",
      title: result.cancelled ? "Order cancelled" : "Order changed",
      message: result.cancelled
        ? `${o.orderNumber} was cancelled - nothing to deliver.`
        : `${o.orderNumber}: some items are not available. New total Rs.${Number(o.total).toFixed(0)}.`,
      entityType: "Order",
      entityId: o.id,
      adminUserId: rider,
    });
  }

  return result;
}

module.exports = { markItemsUnavailable, ADJUSTABLE_STATUSES };
