const validators = require("../../validators/products/products.validator");
const productsService = require("../../services/products/products.service");
const { success, failure } = require("../../utils/apiResponse.util");
const { writeAuditLog } = require("../../utils/auditLogger.util");
const merchService = require("../../services/merch/merch.service");
const combosService = require("../../services/combos/combos.service");

function handleServiceError(err, next, res) {
  if (err.expose) return failure(res, err.statusCode, err.message);
  return next(err);
}

// ---------- Products ----------

async function create(req, res, next) {
  try {
    const { isValid, errors } = validators.validateCreateProduct(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const product = await productsService.createProduct(req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:create",
      entity: "Product",
      entityId: product.id,
      ipAddress: req.ip,
    });

    return success(res, 201, "Product created.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function list(req, res, next) {
  try {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const includeInactive = req.query.includeInactive === "true";
    const products = await productsService.listProducts({
      categoryId,
      includeInactive,
      search: req.query.search,
    });
    return success(res, 200, "Products fetched.", { products });
  } catch (err) {
    return next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const product = await productsService.getProductById(Number(req.params.id));
    return success(res, 200, "Product fetched.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function update(req, res, next) {
  try {
    const { isValid, errors } = validators.validateUpdateProduct(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const product = await productsService.updateProduct(Number(req.params.id), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "Product",
      entityId: product.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 200, "Product updated.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    const product = await productsService.deleteProduct(id);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:delete",
      entity: "Product",
      entityId: id,
      ipAddress: req.ip,
    });

    return success(res, 200, "Product deactivated.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Variants ----------

async function addVariant(req, res, next) {
  try {
    const { isValid, errors } = validators.validateAddVariant(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const productId = Number(req.params.productId);
    const variant = await productsService.addVariant(productId, req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductVariant",
      entityId: variant.id,
      metadata: { productId, created: req.body },
      ipAddress: req.ip,
    });

    return success(res, 201, "Variant added.", { variant });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateVariant(req, res, next) {
  try {
    const { isValid, errors } = validators.validateUpdateVariant(req.body);
    if (!isValid) return failure(res, 422, "Please check the submitted details.", errors);

    const variant = await productsService.updateVariant(Number(req.params.variantId), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductVariant",
      entityId: variant.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 200, "Variant updated.", { variant });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function deleteVariant(req, res, next) {
  try {
    const variantId = Number(req.params.variantId);
    const result = await productsService.deleteVariant(variantId);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:delete",
      entity: "ProductVariant",
      entityId: variantId,
      ipAddress: req.ip,
    });

    return success(res, 200, "Variant deleted.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function toggleVariantStock(req, res, next) {
  try {
    const { isInStock } = req.body || {};
    if (typeof isInStock !== "boolean") {
      return failure(res, 422, "isInStock (true/false) is required.");
    }

    const variantId = Number(req.params.variantId);
    const variant = await productsService.toggleVariantStock(variantId, isInStock);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:toggleStock",
      entity: "ProductVariant",
      entityId: variant.id,
      metadata: { isInStock },
      ipAddress: req.ip,
    });

    return success(res, 200, "Variant stock updated.", { variant });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Image gallery ----------

async function uploadImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return failure(res, 422, "No images received. Field name must be 'images'.");
    }

    const productId = Number(req.params.id);
    const product = await productsService.addProductImages(productId, req.files);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "Product",
      entityId: productId,
      metadata: { imagesAdded: req.files.length },
      ipAddress: req.ip,
    });

    const count = req.files.length;
    return success(res, 201, count === 1 ? "Image uploaded." : `${count} images uploaded.`, { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function reorderImages(req, res, next) {
  try {
    const { imageIds } = req.body || {};
    const isValidList =
      Array.isArray(imageIds) &&
      imageIds.length > 0 &&
      imageIds.every((id) => Number.isInteger(id) && id > 0) &&
      new Set(imageIds).size === imageIds.length;
    if (!isValidList) {
      return failure(res, 422, "imageIds must be a list of unique image ids.");
    }

    const productId = Number(req.params.id);
    const product = await productsService.reorderProductImages(productId, imageIds);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "Product",
      entityId: productId,
      metadata: { imagesReordered: imageIds },
      ipAddress: req.ip,
    });

    return success(res, 200, "Image order saved.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function deleteImage(req, res, next) {
  try {
    const imageId = Number(req.params.imageId);
    const product = await productsService.deleteProductImage(imageId);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "Product",
      entityId: product.id,
      metadata: { imageRemoved: imageId },
      ipAddress: req.ip,
    });

    return success(res, 200, "Image removed.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Tags ----------

// ---------- Combos ----------

async function createCombo(req, res, next) {
  try {
    const product = await combosService.createCombo(req.body || {});
    await writeAuditLog({ adminId: req.admin.id, action: "products:create", entity: "Product", entityId: product.id, metadata: { combo: req.body }, ipAddress: req.ip });
    return success(res, 201, "Combo created.", { product });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function setComboItems(req, res, next) {
  try {
    const productId = Number(req.params.id);
    const result = await combosService.setComboItems(productId, (req.body || {}).items);
    await writeAuditLog({ adminId: req.admin.id, action: "products:update", entity: "Product", entityId: productId, metadata: { comboItems: (req.body || {}).items }, ipAddress: req.ip });
    return success(res, 200, result.isCombo ? "Combo items saved." : "Combo items removed.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function addTag(req, res, next) {
  try {
    const productId = Number(req.params.id);
    const tag = await merchService.addTag(productId, req.body || {});
    await writeAuditLog({ adminId: req.admin.id, action: "products:update", entity: "ProductTag", entityId: tag.id, metadata: { productId, tag: req.body }, ipAddress: req.ip });
    return success(res, 201, "Tag added.", { tag });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateTag(req, res, next) {
  try {
    const tag = await merchService.updateTag(Number(req.params.tagId), req.body || {});
    await writeAuditLog({ adminId: req.admin.id, action: "products:update", entity: "ProductTag", entityId: tag.id, metadata: req.body, ipAddress: req.ip });
    return success(res, 200, "Tag saved.", { tag });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function deleteTag(req, res, next) {
  try {
    const tag = await merchService.deleteTag(Number(req.params.tagId));
    await writeAuditLog({ adminId: req.admin.id, action: "products:update", entity: "ProductTag", entityId: tag.id, metadata: { deleted: tag.label }, ipAddress: req.ip });
    return success(res, 200, "Tag removed.", { deletedId: tag.id });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function getBestsellerSettings(req, res, next) {
  try {
    const settings = await merchService.getBestsellerSettings();
    const ids = settings.enabled ? [...(await merchService.getBestsellerIds(settings))] : [];
    return success(res, 200, "Settings fetched.", { settings, productIds: ids });
  } catch (err) {
    return next(err);
  }
}

async function updateBestsellerSettings(req, res, next) {
  try {
    const settings = await merchService.updateBestsellerSettings(req.body || {});
    const ids = settings.enabled ? [...(await merchService.getBestsellerIds(settings))] : [];
    await writeAuditLog({ adminId: req.admin.id, action: "products:update", entity: "SiteSetting", metadata: { autoBestseller: settings }, ipAddress: req.ip });
    return success(res, 200, "Settings saved.", { settings, productIds: ids });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Product availability ----------

async function toggleStock(req, res, next) {
  try {
    const { isInStock } = req.body || {};
    if (typeof isInStock !== "boolean") {
      return failure(res, 422, "isInStock (true/false) is required.");
    }

    const product = await productsService.toggleProductStock(Number(req.params.id), isInStock);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:toggleStock",
      entity: "Product",
      entityId: product.id,
      metadata: { isInStock },
      ipAddress: req.ip,
    });

    return success(res, 200, isInStock ? "Product marked available." : "Product marked unavailable.", {
      product,
    });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Option groups ----------

async function addOptionGroup(req, res, next) {
  try {
    const { name } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return failure(res, 422, "Group name is required (min 2 characters).");
    }

    const group = await productsService.addOptionGroup(Number(req.params.id), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductOptionGroup",
      entityId: group.id,
      metadata: { productId: Number(req.params.id), created: req.body },
      ipAddress: req.ip,
    });

    return success(res, 201, "Option group added.", { group });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateOptionGroup(req, res, next) {
  try {
    const group = await productsService.updateOptionGroup(Number(req.params.groupId), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductOptionGroup",
      entityId: group.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 200, "Option group updated.", { group });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function deleteOptionGroup(req, res, next) {
  try {
    const groupId = Number(req.params.groupId);
    const result = await productsService.deleteOptionGroup(groupId);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:delete",
      entity: "ProductOptionGroup",
      entityId: groupId,
      ipAddress: req.ip,
    });

    return success(res, 200, "Option group removed.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

// ---------- Options ----------

async function addOption(req, res, next) {
  try {
    const { name, extraPrice } = req.body || {};
    if (!name || typeof name !== "string" || name.trim().length < 1) {
      return failure(res, 422, "Option name is required.");
    }
    if (extraPrice !== undefined && (Number.isNaN(Number(extraPrice)) || Number(extraPrice) < 0)) {
      return failure(res, 422, "Extra price must be a non-negative number.");
    }

    const option = await productsService.addOption(Number(req.params.groupId), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductOption",
      entityId: option.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 201, "Option added.", { option });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function updateOption(req, res, next) {
  try {
    const { extraPrice } = req.body || {};
    if (extraPrice !== undefined && (Number.isNaN(Number(extraPrice)) || Number(extraPrice) < 0)) {
      return failure(res, 422, "Extra price must be a non-negative number.");
    }

    const option = await productsService.updateOption(Number(req.params.optionId), req.body);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:update",
      entity: "ProductOption",
      entityId: option.id,
      metadata: req.body,
      ipAddress: req.ip,
    });

    return success(res, 200, "Option updated.", { option });
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

async function deleteOption(req, res, next) {
  try {
    const optionId = Number(req.params.optionId);
    const result = await productsService.deleteOption(optionId);

    await writeAuditLog({
      adminId: req.admin.id,
      action: "products:delete",
      entity: "ProductOption",
      entityId: optionId,
      ipAddress: req.ip,
    });

    return success(res, 200, "Option removed.", result);
  } catch (err) {
    return handleServiceError(err, next, res);
  }
}

module.exports = {
  create,
  list,
  getOne,
  update,
  remove,
  addVariant,
  updateVariant,
  deleteVariant,
  toggleVariantStock,
  uploadImages,
  reorderImages,
  deleteImage,
  createCombo,
  setComboItems,
  addTag,
  updateTag,
  deleteTag,
  getBestsellerSettings,
  updateBestsellerSettings,
  toggleStock,
  addOptionGroup,
  updateOptionGroup,
  deleteOptionGroup,
  addOption,
  updateOption,
  deleteOption,
};
