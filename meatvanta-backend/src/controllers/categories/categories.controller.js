const { validateCreateCategory, validateUpdateCategory } = require("../../validators/categories/categories.validator");
const categoriesService = require("../../services/categories/categories.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");

async function create(req, res, next) {
  try {
    const { isValid, errors } = validateCreateCategory(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const category = await categoriesService.createCategory(req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "categories:create",
      entity: "Category",
      entityId: category.id,
      ipAddress: req.ip,
    });

    return success(res, 201, "Category created.", { category });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function list(req, res, next) {
  try {
    const includeInactive = req.query.includeInactive === "true";
    const categories = await categoriesService.listCategories({ includeInactive });
    return success(res, 200, "Categories fetched.", { categories });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const category = await categoriesService.getCategoryById(Number(req.params.id));
    return success(res, 200, "Category fetched.", { category });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function update(req, res, next) {
  try {
    const { isValid, errors } = validateUpdateCategory(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const category = await categoriesService.updateCategory(Number(req.params.id), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "categories:update",
      entity: "Category",
      entityId: category.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 200, "Category updated.", { category });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const result = await categoriesService.deleteCategory(id);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "categories:delete",
      entity: "Category",
      entityId: id,
      metadata: result,
      ipAddress: req.ip,
    });

    const message = result.hardDeleted
      ? "Category deleted."
      : `Category has ${result.productCount} product(s) under it, so it was deactivated instead of deleted.`;

    return success(res, 200, message, result);
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function uploadImage(req, res, next) {
  try {
    const id = Number(req.params.id);
    const slot = req.body?.slot === "mobile" ? "mobile" : "desktop";
    const category = await categoriesService.setCategoryImage(id, slot, req.file);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "categories:update",
      entity: "Category",
      entityId: id,
      metadata: { imageSlot: slot },
      ipAddress: req.ip,
    });
    return success(res, 200, "Category image saved.", { category });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

async function removeImage(req, res, next) {
  try {
    const id = Number(req.params.id);
    const slot = req.query.slot === "mobile" ? "mobile" : "desktop";
    const category = await categoriesService.removeCategoryImage(id, slot);
    await writeAuditLog({
      adminId: req.admin.id,
      action: "categories:update",
      entity: "Category",
      entityId: id,
      metadata: { imageRemoved: slot },
      ipAddress: req.ip,
    });
    return success(res, 200, "Category image removed.", { category });
  } catch (err) {
    if (err.expose) return failure(res, err.statusCode, err.message);
    return next(err);
  }
}

module.exports = { uploadImage, removeImage, create, list, getOne, update, remove };
