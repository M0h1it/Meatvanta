const { validateCreateOrder, validatePaymentVerification } = require("../../validators/orders/orders.validator");
const ordersService = require("../../services/orders/orders.service");
const orderAdjustments = require("../../services/orders/orderAdjustments.service");
const deliveryService = require("../../services/delivery/delivery.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");
const { orderMapUrl, hasPin } = require("../../utils/mapLink.util");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

// Adds the delivery deadline (60-90 min promise / end of the booked window) and the
// map link (exact pin when the customer dropped one, else the address text) to an order payload.
function withDue(order) {
  return {
    ...order,
    dueBy: deliveryService.computeDueBy(order),
    mapUrl: orderMapUrl(order),
    hasPin: hasPin(order),
  };
}

async function create(req, res, next) {
  try {
    const { isValid, errors } = validateCreateOrder(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const order = await ordersService.createOrder(req.body, req.admin.id);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:create",
      entity: "Order",
      entityId: order.id,
      ipAddress: req.ip,
    });

    return success(res, 201, "Order created.", { order });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function list(req, res, next) {
  try {
    const { status, search, page, pageSize, riderId, paymentMethod, paymentStatus, from, to } = req.query;
    const result = await ordersService.listOrders({
      status: status || undefined,
      search: search || undefined,
      riderId: riderId || undefined,
      paymentMethod: paymentMethod || undefined,
      paymentStatus: paymentStatus || undefined,
      from: from || undefined,
      to: to || undefined,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Math.min(Number(pageSize), 200) : 25,
    });
    return success(res, 200, "Orders fetched.", { ...result, orders: result.orders.map(withDue) });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const order = await ordersService.getOrderById(Number(req.params.id));
    return success(res, 200, "Order fetched.", { order: withDue(order) });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { status } = req.body || {};
    if (!status) return failure(res, 422, "status is required.");

    const order = await ordersService.updateOrderStatus(Number(req.params.id), status, req.admin.id);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:updateStatus",
      entity: "Order",
      entityId: order.id,
      metadata: { status },
      ipAddress: req.ip,
    });

    return success(res, 200, "Order status updated.", { order });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function cancel(req, res, next) {
  try {
    const id = Number(req.params.id);
    const order = await ordersService.cancelOrder(id, req.admin.id);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:cancel",
      entity: "Order",
      entityId: id,
      metadata: { walletCredited: Number(order.walletCredited) },
      ipAddress: req.ip,
    });

    const credited = Number(order.walletCredited);
    return success(
      res,
      200,
      credited > 0 ? `Order cancelled. Rs.${credited.toFixed(0)} was added to the customer's wallet.` : "Order cancelled.",
      { order }
    );
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function stats(req, res, next) {
  try {
    const stats = await ordersService.getDashboardStats();
    return success(res, 200, "Stats fetched.", stats);
  } catch (err) {
    return next(err);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const { isValid, errors } = validatePaymentVerification(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const order = await ordersService.verifyPayment(Number(req.params.id), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:updateStatus",
      entity: "Order",
      entityId: order.id,
      metadata: { paymentStatus: req.body.paymentStatus },
      ipAddress: req.ip,
    });

    return success(res, 200, `Payment ${req.body.paymentStatus}.`, { order });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function setDeliveryCharge(req, res, next) {
  try {
    const { deliveryCharge } = req.body || {};
    const charge = Number(deliveryCharge);
    if (Number.isNaN(charge) || charge < 0) {
      return failure(res, 422, "deliveryCharge must be a non-negative number.");
    }

    const order = await ordersService.setDeliveryCharge(Number(req.params.id), charge);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:updateStatus",
      entity: "Order",
      entityId: order.id,
      metadata: { deliveryCharge: charge },
      ipAddress: req.ip,
    });

    return success(res, 200, "Delivery charge updated.", { order });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function assignDeliveryPerson(req, res, next) {
  try {
    const { deliveryPersonName, deliveryAdminId } = req.body || {};
    const orderId = Number(req.params.id);

    let order;
    if (deliveryAdminId !== undefined) {
      // New way: pick a rider account (or null to remove).
      const riderId = deliveryAdminId === null || deliveryAdminId === "" ? null : Number(deliveryAdminId);
      if (riderId !== null && (!Number.isInteger(riderId) || riderId <= 0)) {
        return failure(res, 422, "Please pick a valid delivery rider.");
      }
      order = await deliveryService.assignRider(orderId, riderId);
    } else {
      // Old way, kept for old screens: just a name.
      order = await ordersService.assignDeliveryPerson(orderId, deliveryPersonName);
    }

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:updateStatus",
      entity: "Order",
      entityId: order.id,
      metadata: { deliveryPersonName: order.deliveryPersonName, deliveryAdminId: order.deliveryAdminId },
      ipAddress: req.ip,
    });

    return success(res, 200, "Delivery person updated.", { order });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

/**
 * "Item just ran out": body { items: [{ itemId, availableQuantity }] }.
 * Paid orders: the difference is credited to the customer's wallet. COD: the total drops.
 */
async function markUnavailable(req, res, next) {
  try {
    const items = Array.isArray(req.body?.items)
      ? req.body.items.map((i) => ({ itemId: Number(i?.itemId), availableQuantity: i?.availableQuantity }))
      : null;
    if (!items || items.length === 0) return failure(res, 422, "Pick at least one item.");

    const orderId = Number(req.params.id);
    const result = await orderAdjustments.markItemsUnavailable(orderId, items, req.admin);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:adjustItems",
      entity: "Order",
      entityId: orderId,
      metadata: {
        items,
        previousTotal: result.previousTotal,
        newTotal: Number(result.order.total),
        walletCredited: result.credited,
        cancelled: result.cancelled,
      },
      ipAddress: req.ip,
    });

    const message = result.cancelled
      ? `Nothing left to send, so the order was cancelled. Rs.${result.credited.toFixed(0)} was added to the customer's wallet.`
      : result.credited > 0
        ? `Order updated. Rs.${result.credited.toFixed(0)} was added to the customer's wallet.`
        : `Order updated. New total Rs.${Number(result.order.total).toFixed(0)}.`;
    return success(res, 200, message, {
      order: withDue(result.order),
      walletCredited: result.credited,
      cancelled: result.cancelled,
    });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

module.exports = {
  create,
  list,
  getOne,
  updateStatus,
  cancel,
  markUnavailable,
  stats,
  verifyPayment,
  setDeliveryCharge,
  assignDeliveryPerson,
};
