const shopInfoService = require("../../services/shopInfo/shopInfo.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

function validate(body) {
  const errors = {};
  const { shopName, phone, whatsappNumber, email, yearsInBusiness, mapUrl } = body || {};
  const { instagramUrl, facebookUrl, youtubeUrl } = body || {};

  if (shopName !== undefined && (typeof shopName !== "string" || shopName.trim().length < 2)) {
    errors.shopName = "Shop name must be at least 2 characters.";
  }
  // Blank is allowed - the owner may not have filled everything in yet.
  if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) {
    errors.phone = "Enter a valid phone number.";
  }
  if (whatsappNumber && !/^[0-9+\-\s()]{6,20}$/.test(whatsappNumber)) {
    errors.whatsappNumber = "Enter a valid WhatsApp number.";
  }
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (yearsInBusiness !== undefined && (Number.isNaN(Number(yearsInBusiness)) || Number(yearsInBusiness) < 0)) {
    errors.yearsInBusiness = "Years must be a positive number.";
  }
  if (mapUrl && !/^https?:\/\//.test(mapUrl)) {
    errors.mapUrl = "Map link must start with http:// or https://";
  }
  // Blank hides the icon. Anything else must be a real web link, since the
  // footer puts it straight into an <a href>.
  for (const [key, value] of Object.entries({ instagramUrl, facebookUrl, youtubeUrl })) {
    if (value === undefined || value === null || String(value).trim() === "") continue;
    if (!/^https?:\/\/\S+$/.test(String(value).trim()) || String(value).trim().length > 300) {
      errors[key] = "Enter the full link, starting with https://";
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

async function get(req, res, next) {
  try {
    const shopInfo = await shopInfoService.getShopInfo();
    return success(res, 200, "Shop info fetched.", { shopInfo });
  } catch (err) {
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { isValid, errors } = validate(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const shopInfo = await shopInfoService.updateShopInfo(req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "shop_info:update",
      entity: "ShopInfo",
      entityId: shopInfo.id,
      ipAddress: req.ip,
    });

    return success(res, 200, "Shop info updated.", { shopInfo });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

/** Public - same data, no auth. Every customer content page reads from here. */
async function getPublic(req, res, next) {
  try {
    const shopInfo = await shopInfoService.getShopInfo();
    return success(res, 200, "Shop info fetched.", { shopInfo });
  } catch (err) {
    return next(err);
  }
}

module.exports = { get, update, getPublic };
