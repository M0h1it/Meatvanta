const analyticsService = require("../../services/analytics/analytics.service");
const { success, failure } = require("../../utils/apiResponse.util");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

/**
 * GET /api/admin/analytics?from=2026-09-01&to=2026-09-26&groupBy=day&dateBasis=order
 * Leave out `from` for all time. Dates are India-time calendar dates.
 */
async function getAnalytics(req, res, next) {
  try {
    const { from, to, groupBy, dateBasis } = req.query;
    const data = await analyticsService.getAnalytics({
      from: from || undefined,
      to: to || undefined,
      groupBy: groupBy || undefined,
      dateBasis: dateBasis || undefined,
    });
    return success(res, 200, "Analytics fetched.", data);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

module.exports = { getAnalytics };
