const prisma = require("../../config/db");
const { slugify } = require("../../utils/slugify.util");
const { toPublicUrl, writeLocalImage, deleteLocalImage } = require("../../utils/localImageStorage.util");
const { processProductImage } = require("../../utils/imageProcessor.util");

// "desktop" = the main photo, "mobile" = optional phone version (falls back to desktop).
const IMAGE_SLOTS = {
  desktop: { pathField: "imagePath", urlField: "imageUrl", maxSize: 1400 },
  mobile: { pathField: "mobileImagePath", urlField: "mobileImageUrl", maxSize: 900 },
};

function invalidSlot() {
  const err = new Error('Image slot must be "desktop" or "mobile".');
  err.statusCode = 422;
  err.expose = true;
  return err;
}

/** Saves (or replaces) one category photo as a resized WebP. */
async function setCategoryImage(id, slot, file) {
  const cfg = IMAGE_SLOTS[slot];
  if (!cfg) throw invalidSlot();
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFoundError();
  if (!file) {
    const err = new Error("Choose an image to upload.");
    err.statusCode = 422;
    err.expose = true;
    throw err;
  }

  const { buffer, ext } = await processProductImage(file.buffer, cfg.maxSize);
  const relativePath = `categories/${existing.slug}-${slot}-${Date.now()}${ext}`;
  await writeLocalImage(relativePath, buffer);

  let updated;
  try {
    updated = await prisma.category.update({
      where: { id },
      data: { [cfg.pathField]: relativePath, [cfg.urlField]: toPublicUrl(relativePath) },
    });
  } catch (err) {
    deleteLocalImage(relativePath);
    throw err;
  }
  // The old file goes only after the database points at the new one.
  if (existing[cfg.pathField]) deleteLocalImage(existing[cfg.pathField]);
  return updated;
}

async function removeCategoryImage(id, slot) {
  const cfg = IMAGE_SLOTS[slot];
  if (!cfg) throw invalidSlot();
  // The main category photo is compulsory: it can be replaced, never removed.
  if (slot === "desktop") {
    const err = new Error("The category photo is required. Upload a new one to replace it.");
    err.statusCode = 422;
    err.expose = true;
    throw err;
  }
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFoundError();

  const updated = await prisma.category.update({
    where: { id },
    data: { [cfg.pathField]: null, [cfg.urlField]: null },
  });
  if (existing[cfg.pathField]) deleteLocalImage(existing[cfg.pathField]);
  return updated;
}

function notFoundError(message = "Category not found.") {
  const err = new Error(message);
  err.statusCode = 404;
  err.expose = true;
  return err;
}

function conflictError(message) {
  const err = new Error(message);
  err.statusCode = 409;
  err.expose = true;
  return err;
}

async function createCategory({ name, sortOrder }) {
  const slug = slugify(name);

  const existing = await prisma.category.findFirst({
    where: { OR: [{ name }, { slug }] },
  });
  if (existing) {
    throw conflictError("A category with this name already exists.");
  }

  return prisma.category.create({
    data: { name: name.trim(), slug, sortOrder: sortOrder ?? 0 },
  });
}

async function listCategories({ includeInactive = false, countAvailableOnly = false } = {}) {
  return prisma.category.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          // The customer site advertises "N items available", so its count has
          // to match what the product list will actually show - otherwise the
          // homepage promises items the shop pulled for the day.
          // The admin keeps the unfiltered total, which is what it needs.
          products: countAvailableOnly ? { where: { isActive: true, isInStock: true } } : true,
        },
      },
    },
  });
}

async function getCategoryById(id) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw notFoundError();
  return category;
}

async function updateCategory(id, { name, sortOrder, isActive }) {
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) throw notFoundError();

  const data = {};
  if (name !== undefined) {
    data.name = name.trim();
    data.slug = slugify(name);
  }
  if (sortOrder !== undefined) data.sortOrder = sortOrder;
  if (isActive !== undefined) data.isActive = isActive;

  return prisma.category.update({ where: { id }, data });
}

/**
 * Categories with products under them are never hard-deleted - that would
 * either orphan or cascade-delete the products, both bad surprises. Deactivate
 * instead; a category with zero products can be hard-deleted safely.
 */
async function deleteCategory(id) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw notFoundError();

  if (category._count.products > 0) {
    await prisma.category.update({ where: { id }, data: { isActive: false } });
    return { hardDeleted: false, productCount: category._count.products };
  }

  await prisma.category.delete({ where: { id } });
  [category.imagePath, category.mobileImagePath].forEach((p) => p && deleteLocalImage(p));
  return { hardDeleted: true, productCount: 0 };
}

module.exports = { setCategoryImage, removeCategoryImage, createCategory, listCategories, getCategoryById, updateCategory, deleteCategory };