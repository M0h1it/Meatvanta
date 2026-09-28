function isPositiveNumber(val) {
  return typeof val === "number" && !Number.isNaN(val) && val > 0;
}

/** MRP is optional: empty/null clears it, otherwise a positive number. */
function isValidMrp(val) {
  return val === undefined || val === null || val === "" || isPositiveNumber(Number(val));
}

function validateVariantShape(variant) {
  const errors = {};
  if (!variant || typeof variant !== "object") return { label: "Variant must be an object." };

  if (!variant.label || typeof variant.label !== "string" || variant.label.trim().length < 1) {
    errors.label = "Variant label is required (e.g. '500 GM' or '4 Pieces').";
  }
  if (!isPositiveNumber(Number(variant.price))) {
    errors.price = "Variant price must be a positive number.";
  }
  if (!isValidMrp(variant.mrp)) {
    errors.mrp = "MRP must be a positive number, or left empty.";
  }
  return errors;
}

function validateCreateProduct(body) {
  const errors = {};
  const { name, categoryId, variants } = body || {};

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    errors.name = "Product name is required (min 2 characters).";
  }
  if (!categoryId || typeof categoryId !== "number") {
    errors.categoryId = "categoryId is required and must be a number.";
  }
  if (!Array.isArray(variants) || variants.length === 0) {
    errors.variants = "At least one variant (label + price) is required.";
  } else {
    const variantErrors = variants.map(validateVariantShape).filter((e) => Object.keys(e).length > 0);
    if (variantErrors.length > 0) errors.variantDetails = variantErrors;
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateUpdateProduct(body) {
  const errors = {};
  const { name, categoryId, isActive, sortOrder } = body || {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length < 2)) {
    errors.name = "Product name must be at least 2 characters.";
  }
  if (categoryId !== undefined && typeof categoryId !== "number") {
    errors.categoryId = "categoryId must be a number.";
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    errors.isActive = "isActive must be true or false.";
  }
  if (sortOrder !== undefined && typeof sortOrder !== "number") {
    errors.sortOrder = "sortOrder must be a number.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateAddVariant(body) {
  const errors = validateVariantShape(body);
  return { isValid: Object.keys(errors).length === 0, errors };
}

function validateUpdateVariant(body) {
  const errors = {};
  const { label, price, isInStock, mrp } = body || {};

  if (label !== undefined && (typeof label !== "string" || label.trim().length < 1)) {
    errors.label = "Label cannot be empty.";
  }
  if (price !== undefined && !isPositiveNumber(Number(price))) {
    errors.price = "Price must be a positive number.";
  }
  if (!isValidMrp(mrp)) {
    errors.mrp = "MRP must be a positive number, or left empty.";
  }
  if (isInStock !== undefined && typeof isInStock !== "boolean") {
    errors.isInStock = "isInStock must be true or false.";
  }

  return { isValid: Object.keys(errors).length === 0, errors };
}

module.exports = {
  validateCreateProduct,
  validateUpdateProduct,
  validateAddVariant,
  validateUpdateVariant,
};
