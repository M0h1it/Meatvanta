const prisma = require("../../config/db");
const { toPublicUrl, writeLocalImage, deleteLocalImage } = require("../../utils/localImageStorage.util");
const { processProductImage } = require("../../utils/imageProcessor.util");
const { slugify } = require("../../utils/slugify.util");
const combosService = require("../combos/combos.service");

// Most images a single product's gallery may hold.
const MAX_IMAGES_PER_PRODUCT = 8;

function notFoundError(message) {
  const err = new Error(message);
  err.statusCode = 404;
  err.expose = true;
  return err;
}

/** "" / null -> null (no MRP); a number must be above the selling price to mean anything. */
function parseMrp(mrp, price) {
  if (mrp === undefined) return undefined;
  if (mrp === null || mrp === "") return null;
  const value = Number(mrp);
  if (price !== undefined && price !== null && value <= Number(price)) {
    throw validationError(`MRP (₹${value}) must be higher than the selling price (₹${Number(price)}), or left empty.`);
  }
  return value;
}

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 422;
  err.expose = true;
  return err;
}

// Gallery order: sortOrder first, id as a tie-breaker so the order is always stable.
const imageOrderBy = [{ sortOrder: "asc" }, { id: "asc" }];

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  variants: { orderBy: { sortOrder: "asc" } },
  optionGroups: {
    orderBy: { sortOrder: "asc" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  },
  images: {
    orderBy: imageOrderBy,
    select: { id: true, url: true, sortOrder: true },
  },
  tags: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
  comboItems: combosService.comboItemsInclude,
};

// imageUrl is intentionally not accepted here: the cover image is managed only
// through the gallery endpoints, so it can never drift from product_images.
async function createProduct({ name, categoryId, description, sortOrder, variants }) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) throw notFoundError("categoryId does not match any existing category.");

  return prisma.product.create({
    data: {
      name: name.trim(),
      categoryId,
      description: description || null,
      sortOrder: sortOrder ?? 0,
      variants: {
        create: variants.map((v, index) => ({
          label: v.label.trim(),
          price: Number(v.price),
          mrp: parseMrp(v.mrp, v.price) ?? null,
          isInStock: v.isInStock ?? true,
          sortOrder: v.sortOrder ?? index,
        })),
      },
    },
    include: productInclude,
  });
}

async function listProducts({ categoryId, includeInactive = false, status, search, inStockOnly = false } = {}) {
  const trimmedSearch = typeof search === "string" ? search.trim() : "";

  return prisma.product.findMany({
    where: {
      ...(categoryId ? { categoryId } : {}),
      // status: "active" | "inactive" | "all". Older callers pass includeInactive.
      ...(status === "inactive"
        ? { isActive: false }
        : status === "all" || (!status && includeInactive)
          ? {}
          : { isActive: true }),
      // Customer-facing calls pass inStockOnly so items pulled for the day vanish
      // from the shop; the admin list still shows them so they can be switched back.
      ...(inStockOnly ? { isInStock: true } : {}),
      // Matches product name or description. MySQL collation is
      // case-insensitive by default, so no extra mode flag is needed.
      ...(trimmedSearch
        ? {
            OR: [
              { name: { contains: trimmedSearch } },
              { description: { contains: trimmedSearch } },
            ],
          }
        : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: productInclude,
  });
}

/** How many products are live / deactivated - drives the tab counts in admin. */
async function countByStatus() {
  const [active, inactive] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: false } }),
  ]);
  return { active, inactive };
}

async function getProductById(id) {
  const product = await prisma.product.findUnique({ where: { id }, include: productInclude });
  if (!product) throw notFoundError("Product not found.");
  return product;
}

async function updateProduct(id, { name, categoryId, description, isActive, isInStock, sortOrder }) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Product not found.");

  if (categoryId !== undefined) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) throw notFoundError("categoryId does not match any existing category.");
  }

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (categoryId !== undefined) data.categoryId = categoryId;
  if (description !== undefined) data.description = description;
  if (isActive !== undefined) data.isActive = isActive;
  if (isInStock !== undefined) data.isInStock = isInStock;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  return prisma.product.update({ where: { id }, data, include: productInclude });
}

/** Soft delete - catalogue history (past orders reference variants) should never hard-vanish. */
async function deleteProduct(id) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Product not found.");

  return prisma.product.update({ where: { id }, data: { isActive: false }, include: productInclude });
}

/**
 * Permanent delete. Only for a product that is already deactivated, and only
 * when none of its weights sits inside a combo. Past orders keep their own
 * name/price snapshot (order_items.product_variant_id just becomes empty).
 * Image files are removed from disk after the database rows are gone.
 */
async function permanentlyDeleteProduct(id) {
  const existing = await prisma.product.findUnique({
    where: { id },
    include: { variants: { select: { id: true } }, images: { select: { path: true } } },
  });
  if (!existing) throw notFoundError("Product not found.");
  if (existing.isActive) {
    throw validationError("Deactivate this product first, then you can delete it permanently.");
  }

  const comboNames = new Map();
  for (const v of existing.variants) {
    for (const combo of await combosService.combosUsingVariant(v.id)) comboNames.set(combo.id, combo.name);
  }
  if (comboNames.size > 0) {
    const names = [...comboNames.values()].map((n) => `"${n}"`).join(", ");
    throw validationError(
      `This product is inside ${comboNames.size === 1 ? "the combo" : "the combos"} ${names}. Remove it from ${comboNames.size === 1 ? "that combo" : "those combos"} first.`
    );
  }

  const paths = [...existing.images.map((i) => i.path), existing.imagePath].filter(Boolean);
  await prisma.product.delete({ where: { id } });

  for (const path of new Set(paths)) {
    const stillUsed = await prisma.productImage.count({ where: { path } });
    if (stillUsed === 0) deleteLocalImage(path);
  }
  return { deletedId: id };
}

async function addVariant(productId, { label, price, mrp, isInStock, sortOrder }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFoundError("Product not found.");

  return prisma.productVariant.create({
    data: {
      productId,
      label: label.trim(),
      price: Number(price),
      mrp: parseMrp(mrp, price) ?? null,
      isInStock: isInStock ?? true,
      sortOrder: sortOrder ?? 0,
    },
  });
}

async function updateVariant(variantId, { label, price, mrp, isInStock, sortOrder }) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw notFoundError("Variant not found.");

  const data = {};
  if (label !== undefined) data.label = label.trim();
  if (price !== undefined) data.price = Number(price);
  // Checked against the price the variant will have after this update.
  if (mrp !== undefined) data.mrp = parseMrp(mrp, price !== undefined ? price : existing.price);
  if (isInStock !== undefined) data.isInStock = isInStock;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  return prisma.productVariant.update({ where: { id: variantId }, data });
}

async function deleteVariant(variantId) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw notFoundError("Variant not found.");

  // A combo must never silently lose an item.
  const combos = await combosService.combosUsingVariant(variantId);
  if (combos.length > 0) {
    throw validationError(
      `This weight is inside ${combos.length === 1 ? "the combo" : "the combos"} ${combos.map((c) => `"${c.name}"`).join(", ")}. Take it out of the combo first.`
    );
  }

  await prisma.productVariant.delete({ where: { id: variantId } });
  return { deletedId: variantId };
}

async function toggleVariantStock(variantId, isInStock) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } });
  if (!existing) throw notFoundError("Variant not found.");

  return prisma.productVariant.update({ where: { id: variantId }, data: { isInStock } });
}

// ---------- Image gallery ----------

/**
 * Mirrors the gallery's first image onto Product.imageUrl / imagePath.
 * Listings, the cart and SEO tags only ever read those two fields, so they
 * keep working without knowing the gallery exists. Must run inside the same
 * transaction as whatever changed the gallery.
 */
async function syncCoverImage(tx, productId) {
  const cover = await tx.productImage.findFirst({
    where: { productId },
    orderBy: imageOrderBy,
  });

  await tx.product.update({
    where: { id: productId },
    data: { imageUrl: cover ? cover.url : null, imagePath: cover ? cover.path : null },
  });
}

/**
 * Processes each uploaded file (resize + WebP, see imageProcessor.util.js),
 * saves it under UPLOADS_DIR/<category-slug>/ and appends it to the gallery.
 * If anything fails part-way, files already written are removed again so no
 * orphans are left on disk.
 */
async function addProductImages(productId, files) {
  if (!files || files.length === 0) throw validationError("Select at least one image to upload.");

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { category: true, _count: { select: { images: true } } },
  });
  if (!product) throw notFoundError("Product not found.");

  const existingCount = product._count.images;
  if (existingCount + files.length > MAX_IMAGES_PER_PRODUCT) {
    const remaining = Math.max(MAX_IMAGES_PER_PRODUCT - existingCount, 0);
    throw validationError(
      remaining === 0
        ? `This product already has the maximum of ${MAX_IMAGES_PER_PRODUCT} images. Delete one first.`
        : `A product can have up to ${MAX_IMAGES_PER_PRODUCT} images. You can add ${remaining} more.`
    );
  }

  const folder = product.category?.slug || "uncategorized";
  const baseName = slugify(product.name) || "product";
  const writtenPaths = [];

  try {
    const saved = [];
    // One at a time on purpose: image processing is CPU-heavy, and doing six
    // in parallel on a small VPS would slow every other request down.
    for (let i = 0; i < files.length; i += 1) {
      const { buffer, ext } = await processProductImage(files[i].buffer);
      const relativePath = `${folder}/${baseName}-${Date.now()}-${i + 1}${ext}`;
      await writeLocalImage(relativePath, buffer);
      writtenPaths.push(relativePath);
      saved.push({ path: relativePath, url: toPublicUrl(relativePath) });
    }

    await prisma.$transaction(async (tx) => {
      const last = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
      });
      const startAt = last ? last.sortOrder + 1 : 0;

      await tx.productImage.createMany({
        data: saved.map((img, index) => ({
          productId,
          path: img.path,
          url: img.url,
          sortOrder: startAt + index,
        })),
      });

      await syncCoverImage(tx, productId);
    });
  } catch (err) {
    writtenPaths.forEach((p) => deleteLocalImage(p));
    throw err;
  }

  return getProductById(productId);
}

/**
 * Sets the gallery order. imageIds must list every image of the product
 * exactly once; the first one becomes the cover.
 */
async function reorderProductImages(productId, imageIds) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { images: { select: { id: true } } },
  });
  if (!product) throw notFoundError("Product not found.");

  const currentIds = product.images.map((img) => img.id).sort((a, b) => a - b);
  const requestedIds = [...imageIds].sort((a, b) => a - b);
  const sameSet =
    currentIds.length === requestedIds.length && currentIds.every((id, i) => id === requestedIds[i]);
  if (!sameSet) {
    throw validationError("The image list is out of date. Refresh the page and try again.");
  }

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < imageIds.length; i += 1) {
      await tx.productImage.update({ where: { id: imageIds[i] }, data: { sortOrder: i } });
    }
    await syncCoverImage(tx, productId);
  });

  return getProductById(productId);
}

/**
 * Removes one image. The DB row goes first (and the cover is re-synced in
 * the same transaction); the file is deleted from disk only after that
 * commits, so a failure can never leave the shop pointing at a missing file.
 */
async function deleteProductImage(imageId) {
  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image) throw notFoundError("Image not found.");

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    await syncCoverImage(tx, image.productId);
  });

  if (image.path) {
    // Only remove the file if no other gallery row still points at it.
    const stillUsed = await prisma.productImage.count({ where: { path: image.path } });
    if (stillUsed === 0) deleteLocalImage(image.path);
  }

  return getProductById(image.productId);
}

/** Product-level availability - pulls the whole item for the day in one click. */
async function toggleProductStock(id, isInStock) {
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) throw notFoundError("Product not found.");

  return prisma.product.update({ where: { id }, data: { isInStock }, include: productInclude });
}

// ---------- Option groups ----------

async function addOptionGroup(productId, { name, isRequired, allowMultiple, sortOrder }) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFoundError("Product not found.");
  if (product.isCombo) throw validationError("Combos don't have options - the items inside come as listed.");

  return prisma.productOptionGroup.create({
    data: {
      productId,
      name: name.trim(),
      isRequired: isRequired ?? false,
      allowMultiple: allowMultiple ?? false,
      sortOrder: sortOrder ?? 0,
    },
    include: { options: true },
  });
}

async function updateOptionGroup(groupId, { name, isRequired, allowMultiple, sortOrder }) {
  const existing = await prisma.productOptionGroup.findUnique({ where: { id: groupId } });
  if (!existing) throw notFoundError("Option group not found.");

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (isRequired !== undefined) data.isRequired = isRequired;
  if (allowMultiple !== undefined) data.allowMultiple = allowMultiple;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  return prisma.productOptionGroup.update({ where: { id: groupId }, data, include: { options: true } });
}

async function deleteOptionGroup(groupId) {
  const existing = await prisma.productOptionGroup.findUnique({ where: { id: groupId } });
  if (!existing) throw notFoundError("Option group not found.");

  // Options cascade with the group. Past orders keep their snapshot, so
  // deleting here never rewrites what a customer actually bought.
  await prisma.productOptionGroup.delete({ where: { id: groupId } });
  return { deletedId: groupId };
}

// ---------- Options ----------

async function addOption(groupId, { name, extraPrice, isAvailable, sortOrder }) {
  const group = await prisma.productOptionGroup.findUnique({ where: { id: groupId } });
  if (!group) throw notFoundError("Option group not found.");

  return prisma.productOption.create({
    data: {
      groupId,
      name: name.trim(),
      extraPrice: Number(extraPrice ?? 0),
      isAvailable: isAvailable ?? true,
      sortOrder: sortOrder ?? 0,
    },
  });
}

async function updateOption(optionId, { name, extraPrice, isAvailable, sortOrder }) {
  const existing = await prisma.productOption.findUnique({ where: { id: optionId } });
  if (!existing) throw notFoundError("Option not found.");

  const data = {};
  if (name !== undefined) data.name = name.trim();
  if (extraPrice !== undefined) data.extraPrice = Number(extraPrice);
  if (isAvailable !== undefined) data.isAvailable = isAvailable;
  if (sortOrder !== undefined) data.sortOrder = sortOrder;

  return prisma.productOption.update({ where: { id: optionId }, data });
}

async function deleteOption(optionId) {
  const existing = await prisma.productOption.findUnique({ where: { id: optionId } });
  if (!existing) throw notFoundError("Option not found.");

  await prisma.productOption.delete({ where: { id: optionId } });
  return { deletedId: optionId };
}

module.exports = {
  createProduct,
  listProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  permanentlyDeleteProduct,
  countByStatus,
  addVariant,
  updateVariant,
  deleteVariant,
  toggleVariantStock,
  addProductImages,
  reorderProductImages,
  deleteProductImage,
  toggleProductStock,
  addOptionGroup,
  updateOptionGroup,
  deleteOptionGroup,
  addOption,
  updateOption,
  deleteOption,
  MAX_IMAGES_PER_PRODUCT,
};
