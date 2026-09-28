const bannersService = require("../../services/banners/banners.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

async function list(req, res, next) {
  try {
    const [banners, layouts] = await Promise.all([bannersService.listBanners(), bannersService.getLayouts()]);
    return success(res, 200, "Banners fetched.", {
      banners,
      layouts,
      placements: bannersService.PLACEMENTS,
      options: {
        desktopRatios: bannersService.DESKTOP_RATIOS,
        mobileRatios: bannersService.MOBILE_RATIOS,
        focusPoints: bannersService.FOCUS_POINTS,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const banner = await bannersService.getBanner(Number(req.params.id));
    return success(res, 200, "Banner fetched.", { banner });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function create(req, res, next) {
  try {
    const banner = await bannersService.createBanner(req.body || {}, req.files);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "banners:create",
      entity: "Banner",
      entityId: banner.id,
      metadata: { title: banner.title, placement: banner.placement },
      ipAddress: req.ip,
    });
    return success(res, 201, "Banner created.", { banner });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function update(req, res, next) {
  try {
    const banner = await bannersService.updateBanner(Number(req.params.id), req.body || {}, req.files);
    const { title, placement, isActive, startsAt, endsAt, linkType, linkValue } = req.body || {};
    await writeAuditLog({
      adminId: req.admin.id,
      action: "banners:update",
      entity: "Banner",
      entityId: banner.id,
      metadata: {
        changed: { title, placement, isActive, startsAt, endsAt, linkType, linkValue },
        filesReplaced: Object.keys(req.files || {}),
      },
      ipAddress: req.ip,
    });
    return success(res, 200, "Banner saved.", { banner });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const result = await bannersService.deleteBanner(id);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "banners:delete",
      entity: "Banner",
      entityId: id,
      ipAddress: req.ip,
    });
    return success(res, 200, "Banner deleted.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function reorder(req, res, next) {
  try {
    const { placement, ids } = req.body || {};
    const valid =
      Array.isArray(ids) && ids.length > 0 && ids.every((id) => Number.isInteger(id) && id > 0) && new Set(ids).size === ids.length;
    if (!valid) return failure(res, 422, "ids must be a list of unique banner ids.");

    const banners = await bannersService.reorderBanners(placement, ids);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "banners:update",
      entity: "Banner",
      metadata: { reordered: { placement, ids } },
      ipAddress: req.ip,
    });
    return success(res, 200, "Order saved.", { banners });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateLayout(req, res, next) {
  try {
    const layout = await bannersService.updateLayout(req.params.placement, req.body || {});
    await writeAuditLog({
      adminId: req.admin.id,
      action: "banners:update",
      entity: "BannerPlacementSetting",
      metadata: layout,
      ipAddress: req.ip,
    });
    return success(res, 200, "Layout saved.", { layout });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

/** Public - live banners for the customer site, grouped by placement, plus each spot's shape. */
async function listLive(req, res, next) {
  try {
    const [banners, layouts] = await Promise.all([bannersService.listLiveBanners(), bannersService.getLayouts()]);
    // Short cache: a banner switched off in the admin disappears within a minute.
    res.set("Cache-Control", "public, max-age=60");
    return success(res, 200, "Banners fetched.", { banners, layouts });
  } catch (err) {
    return next(err);
  }
}

module.exports = { list, getOne, create, update, remove, reorder, updateLayout, listLive };
