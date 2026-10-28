const appOrdersService = require("../../services/appOrders/appOrders.service");
const { validateTab, validateAppStatus } = require("../../validators/app/app.validator");
const { success, failure } = require("../../utils/apiResponse.util");

function handleError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

function orderIdFrom(req) {
  const id = Number(req.params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function list(req, res, next) {
  try {
    const { isValid, tab } = validateTab(req.query.tab);
    if (!isValid) return failure(res, 422, "tab must be one of: new, active");
    return success(res, 200, "Orders fetched.", { orders: await appOrdersService.listOrders(tab) });
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function getOne(req, res, next) {
  try {
    const id = orderIdFrom(req);
    if (!id) return failure(res, 400, "Invalid order.");
    return success(res, 200, "Order fetched.", { order: await appOrdersService.getOrder(id) });
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function acknowledge(req, res, next) {
  try {
    const id = orderIdFrom(req);
    if (!id) return failure(res, 400, "Invalid order.");
    const order = await appOrdersService.acknowledge(id, req.admin, req.ip);
    return success(res, 200, "Marked as seen.", { order });
  } catch (err) {
    return handleError(err, next, res);
  }
}

async function updateStatus(req, res, next) {
  try {
    const id = orderIdFrom(req);
    if (!id) return failure(res, 400, "Invalid order.");
    const check = validateAppStatus(req.body);
    if (!check.isValid) return failure(res, 422, check.message);

    const order = await appOrdersService.changeStatus(id, req.body.status, req.admin, req.ip);
    return success(res, 200, "Order status updated.", { order });
  } catch (err) {
    return handleError(err, next, res);
  }
}

module.exports = { list, getOne, acknowledge, updateStatus };
