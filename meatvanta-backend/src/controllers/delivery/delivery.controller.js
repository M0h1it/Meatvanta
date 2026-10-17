const deliveryService = require("../../services/delivery/delivery.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

function handleError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

// ---- owner / staff side ----

async function listRiders(req, res, next) {
  try {
    return success(res, 200, "Riders fetched.", { riders: await deliveryService.listRiders() });
  } catch (err) {
    return handleError(err, next, res);
  }
}

function orderIdFrom(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Failed delivery -> send again (same rider, or another one). */
async function retry(req, res, next) {
  try {
    const orderId = orderIdFrom(req);
    if (!orderId) return failure(res, 400, "Invalid order.");
    const raw = req.body?.riderId;
    const riderId = raw === undefined || raw === null || raw === "" ? undefined : Number(raw);
    if (riderId !== undefined && (!Number.isInteger(riderId) || riderId <= 0)) {
      return failure(res, 422, "Please pick a valid delivery rider.");
    }
    const order = await deliveryService.retryDelivery(orderId, riderId);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "delivery:assign",
      entity: "Order",
      entityId: orderId,
      metadata: { event: "retry_delivery", riderId: riderId ?? order.deliveryAdminId },
      ipAddress: req.ip,
    });
    return success(res, 200, "Delivery will be tried again.", { order });
  } catch (err) {
    return handleError(err, next, res);
  }
}

/** Failed delivery -> give up and cancel the order. */
async function cancelFailed(req, res, next) {
  try {
    const orderId = orderIdFrom(req);
    if (!orderId) return failure(res, 400, "Invalid order.");
    const { order, refundNeeded, walletCredited, creditSkipped } = await deliveryService.cancelFailedDelivery(orderId, req.admin.id);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "orders:cancel",
      entity: "Order",
      entityId: orderId,
      metadata: { event: "failed_delivery_cancelled", walletCredited, creditSkipped },
      ipAddress: req.ip,
    });
    const message = walletCredited > 0
      ? `Order cancelled. Rs.${walletCredited.toFixed(0)} was added to the customer's wallet.`
      : "Order cancelled.";
    return success(res, 200, message, { order, refundNeeded, walletCredited, creditSkipped });
  } catch (err) {
    return handleError(err, next, res);
  }
}

// ---- cash hand-over ----

async function cashSummary(req, res, next) {
  try {
    return success(res, 200, "Rider cash fetched.", await deliveryService.cashSummary());
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function settleCash(req, res, next) {
  try {
    const riderId = Number(req.body?.riderId);
    const orderIds = Array.isArray(req.body?.orderIds) ? req.body.orderIds : undefined;
    const result = await deliveryService.settleCash({ riderId, orderIds, receivedByName: req.admin.name });
    await writeAuditLog({
      adminId: req.admin.id,
      action: "delivery:settle",
      entity: "Admin",
      entityId: riderId,
      metadata: result,
      ipAddress: req.ip,
    });
    return success(res, 200, `Received Rs.${result.amount.toFixed(0)}.`, result);
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function myCash(req, res, next) {
  try {
    return success(res, 200, "Cash fetched.", await deliveryService.myCash(req.admin.id));
  } catch (err) {
    return handleError(err, next, res);
  }
}

// ---- rider side: every call is limited to orders assigned to the logged-in rider ----

async function myOrders(req, res, next) {
  try {
    const data = await deliveryService.listMyOrders(req.admin.id);
    return success(res, 200, "Deliveries fetched.", data);
  } catch (err) {
    return handleError(err, next, res);
  }
}

function riderAction(serviceFn, message, auditNote) {
  return async (req, res, next) => {
    try {
      const orderId = Number(req.params.id);
      if (!Number.isInteger(orderId) || orderId <= 0) return failure(res, 400, "Invalid order.");
      const order = await serviceFn(req.admin.id, orderId, req.body?.reason);
      await writeAuditLog({
        adminId: req.admin.id,
        action: "delivery:updateStatus",
        entity: "Order",
        entityId: orderId,
        metadata: { event: auditNote, reason: req.body?.reason },
        ipAddress: req.ip,
      });
      return success(res, 200, message, { order });
    } catch (err) {
      return handleError(err, next, res);
    }
  };
}

module.exports = {
  listRiders,
  retry,
  cancelFailed,
  cashSummary,
  settleCash,
  myCash,
  myOrders,
  pickUp: riderAction(deliveryService.markPickedUp, "Order picked up.", "picked_up"),
  deliver: riderAction(deliveryService.markDelivered, "Order delivered.", "delivered"),
  failed: riderAction(deliveryService.reportFailed, "Problem reported to the shop.", "failed"),
};
