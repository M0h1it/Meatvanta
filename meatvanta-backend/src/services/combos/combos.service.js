const prisma = require("../../config/db");

/**
 * Combos = a product (isCombo) whose one "pack" contains other products'
 * variants, e.g. "Chicken Curry Cut 1 KG x1 + Mutton Keema 500 GM x1".
 *
 * The combo is still a normal product - photos, tags, MRP, category, coupons
 * and the cart all work unchanged. This service only adds its contents:
 *  - admin: create a combo / change its contents
 *  - availability: a combo can't be bought if anything inside is unavailable
 *  - checkout: a snapshot of the contents is saved on the order line
 */

const MAX_ITEMS = 12;
const MAX_QTY = 20;

// Added to productInclude so every product read carries its combo contents.
const comboItemsInclude = {
  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  include: {
    variant: {
      select: {
        id: true,
        label: true,
        price: true,
        isInStock: true,
        product: { select: { id: true, name: true, imageUrl: true, isActive: true, isInStock: true, isCombo: true } },
      },
    },
  },
};

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/** Validates [{ variantId, quantity }] and returns rows ready to insert. */
async function validateItems(items, comboProductId = null) {
  if (!Array.isArray(items) || items.length === 0) throw httpError(422, "Add at least one item to the combo.");
  if (items.length > MAX_ITEMS) throw httpError(422, `A combo can have up to ${MAX_ITEMS} items.`);

  const seen = new Set();
  const clean = items.map((item, index) => {
    const variantId = Number(item.variantId);
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(variantId) || variantId < 1) throw httpError(422, "Choose a product and weight for every item.");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw httpError(422, `Quantity must be 1 to ${MAX_QTY}.`);
    }
    if (seen.has(variantId)) throw httpError(422, "The same item is added twice - increase its quantity instead.");
    seen.add(variantId);
    return { variantId, quantity, sortOrder: index };
  });

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: [...seen] } },
    include: { product: { select: { id: true, name: true, isCombo: true } } },
  });
  if (variants.length !== seen.size) throw httpError(422, "One of the chosen items no longer exists.");
  for (const v of variants) {
    if (v.product.isCombo) throw httpError(422, `"${v.product.name}" is itself a combo - a combo can't contain another combo.`);
    if (comboProductId && v.productId === comboProductId) throw httpError(422, "A combo can't contain itself.");
  }
  return clean;
}

/** One step: product (isCombo) + its single pack variant + contents. */
async function createCombo({ name, categoryId, description, price, mrp, label, items }) {
  const trimmedName = String(name || "").trim();
  if (trimmedName.length < 2 || trimmedName.length > 150) throw httpError(422, "Combo name must be 2 to 150 characters.");
  const category = await prisma.category.findUnique({ where: { id: Number(categoryId) } });
  if (!category) throw httpError(422, "Choose a category for the combo.");
  const priceValue = Number(price);
  if (!Number.isFinite(priceValue) || priceValue <= 0) throw httpError(422, "Enter the combo price.");
  let mrpValue = null;
  if (mrp !== undefined && mrp !== null && mrp !== "") {
    mrpValue = Number(mrp);
    if (!Number.isFinite(mrpValue) || mrpValue <= priceValue) {
      throw httpError(422, `MRP (₹${mrp}) must be higher than the combo price (₹${priceValue}), or left empty.`);
    }
  }
  const packLabel = String(label || "1 Pack").trim().slice(0, 50) || "1 Pack";
  const rows = await validateItems(items);

  return prisma.product.create({
    data: {
      name: trimmedName,
      categoryId: category.id,
      description: description ? String(description) : null,
      isCombo: true,
      variants: { create: [{ label: packLabel, price: priceValue, mrp: mrpValue, sortOrder: 0 }] },
      comboItems: { create: rows },
    },
  });
}

/**
 * Replaces a product's contents. An empty list turns it back into a normal
 * product; a non-empty list on a normal product makes it a combo.
 */
async function setComboItems(productId, items) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw httpError(404, "Product not found.");

  const rows = Array.isArray(items) && items.length === 0 ? [] : await validateItems(items, productId);
  if (rows.length > 0) {
    const usedIn = await prisma.comboItem.count({ where: { variant: { productId } } });
    if (usedIn > 0) throw httpError(422, "This product is inside another combo, so it can't become a combo itself.");
    const optionGroups = await prisma.productOptionGroup.count({ where: { productId } });
    if (optionGroups > 0) throw httpError(422, "Remove this product's options first - combos don't have options.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.comboItem.deleteMany({ where: { comboProductId: productId } });
    if (rows.length > 0) {
      await tx.comboItem.createMany({ data: rows.map((r) => ({ ...r, comboProductId: productId })) });
    }
    await tx.product.update({ where: { id: productId }, data: { isCombo: rows.length > 0 } });
  });
  return { isCombo: rows.length > 0 };
}

/** Combos that contain this variant - used to stop deleting it. */
async function combosUsingVariant(variantId) {
  const rows = await prisma.comboItem.findMany({
    where: { variantId },
    include: { comboProduct: { select: { id: true, name: true } } },
  });
  return rows.map((r) => r.comboProduct);
}

/** Why a combo can't be bought right now, or null if it can. */
function unavailableReason(comboItems = []) {
  if (comboItems.length === 0) return "This combo is empty.";
  for (const item of comboItems) {
    const v = item.variant;
    if (!v || !v.product) return "An item in this combo no longer exists.";
    if (!v.product.isActive || !v.product.isInStock || !v.isInStock) {
      return `"${v.product.name} - ${v.label}" in this combo isn't available today.`;
    }
  }
  return null;
}

/** [{ productName, variantLabel, quantity }] - what goes on the order line. */
function snapshot(comboItems = []) {
  return comboItems.map((i) => ({
    productName: i.variant.product.name,
    variantLabel: i.variant.label,
    quantity: i.quantity,
  }));
}

/** Loads contents for many products at once: Map(productId -> comboItems). */
async function loadContents(productIds) {
  const rows = await prisma.comboItem.findMany({
    where: { comboProductId: { in: [...new Set(productIds)] } },
    ...comboItemsInclude,
  });
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.comboProductId)) map.set(row.comboProductId, []);
    map.get(row.comboProductId).push(row);
  }
  return map;
}

/**
 * For checkout: throws if a combo in the cart can't be bought; returns
 * Map(productId -> snapshot) for the combos.
 */
async function checkoutSnapshots(comboProductIds) {
  const result = new Map();
  if (comboProductIds.length === 0) return result;
  const contents = await loadContents(comboProductIds);
  for (const id of new Set(comboProductIds)) {
    const items = contents.get(id) || [];
    const reason = unavailableReason(items);
    if (reason) throw httpError(400, reason);
    result.set(id, snapshot(items));
  }
  return result;
}

/**
 * Customer-facing shape. Replaces the raw `comboItems` with
 * `combo: { items, value, available }`, where value = what the items cost
 * bought separately. Unavailable combos are dropped from lists
 * (hideUnavailable) or shown with every variant out of stock.
 */
function toPublic(products, { hideUnavailable = false } = {}) {
  const out = [];
  for (const product of products) {
    const { comboItems, ...rest } = product;
    if (!product.isCombo) {
      out.push(rest);
      continue;
    }
    const reason = unavailableReason(comboItems || []);
    if (reason && hideUnavailable) continue;
    const items = (comboItems || []).filter((i) => i.variant?.product).map((i) => ({
      productId: i.variant.product.id,
      productName: i.variant.product.name,
      variantLabel: i.variant.label,
      imageUrl: i.variant.product.imageUrl,
      quantity: i.quantity,
      unitPrice: Number(i.variant.price),
    }));
    const value = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
    out.push({
      ...rest,
      // A combo has no add-ons.
      optionGroups: [],
      variants: reason ? (rest.variants || []).map((v) => ({ ...v, isInStock: false })) : rest.variants,
      combo: { items, value, available: !reason },
    });
  }
  return out;
}

module.exports = {
  MAX_ITEMS,
  comboItemsInclude,
  createCombo,
  setComboItems,
  combosUsingVariant,
  unavailableReason,
  snapshot,
  checkoutSnapshots,
  toPublic,
};
