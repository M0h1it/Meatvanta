const couponsService = require("../../services/coupons/coupons.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

async function list(req, res, next) {
  try {
    const coupons = await couponsService.listCoupons();
    return success(res, 200, "Coupons fetched.", { coupons });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const coupon = await couponsService.getCoupon(Number(req.params.id));
    return success(res, 200, "Coupon fetched.", { coupon });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function create(req, res, next) {
  try {
    const coupon = await couponsService.createCoupon(req.body || {});
    await writeAuditLog({
      adminId: req.admin.id,
      action: "coupons:create",
      entity: "Coupon",
      entityId: coupon.id,
      metadata: { code: coupon.code, type: coupon.type, value: coupon.value },
      ipAddress: req.ip,
    });
    return success(res, 201, "Coupon created.", { coupon });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function update(req, res, next) {
  try {
    const coupon = await couponsService.updateCoupon(Number(req.params.id), req.body || {});
    await writeAuditLog({
      adminId: req.admin.id,
      action: "coupons:update",
      entity: "Coupon",
      entityId: coupon.id,
      metadata: req.body,
      ipAddress: req.ip,
    });
    return success(res, 200, "Coupon saved.", { coupon });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const result = await couponsService.deleteCoupon(id);
    await writeAuditLog({ adminId: req.admin.id, action: "coupons:delete", entity: "Coupon", entityId: id, ipAddress: req.ip });
    return success(res, 200, "Coupon deleted.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

module.exports = { list, getOne, create, update, remove };
