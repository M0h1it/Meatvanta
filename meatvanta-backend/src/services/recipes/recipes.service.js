const fs = require("fs");
const path = require("path");
const prisma = require("../../config/db");
const { toPublicUrl, writeLocalImage, deleteLocalImage, resolveInsideUploads } = require("../../utils/localImageStorage.util");
const { processProductImage } = require("../../utils/imageProcessor.util");
const { slugify } = require("../../utils/slugify.util");

/**
 * Recipes: "how to cook it", written by the shop.
 *
 * The editor saves a whole recipe at once (details + photos + ingredients +
 * steps). Photos are uploaded first (they land in uploads/recipes/<id>/ and
 * come back as { path, url }), then referenced by the save. On every save,
 * files in that folder that the recipe no longer uses are removed, so
 * replaced photos and abandoned uploads don't pile up.
 */

const DIFFICULTIES = ["easy", "medium", "hard"];
const FLAMES = ["none", "low", "medium", "high"];
const MAX_IMAGES = 10;
const MAX_INGREDIENTS = 40;
const MAX_STEPS = 30;
// Unused photos younger than this are kept (an editor may still be about to save them).
const FRESH_UPLOAD_MS = 60 * 60 * 1000;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const ordered = [{ sortOrder: "asc" }, { id: "asc" }];
const fullInclude = {
  images: { orderBy: ordered },
  ingredients: {
    orderBy: ordered,
    include: { product: { select: { id: true, name: true, imageUrl: true, isActive: true } } },
  },
  steps: { orderBy: ordered },
};

// ---------- helpers ----------

function optionalInt(value, field, min, max) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw httpError(422, `${field} must be a whole number from ${min} to ${max}.`);
  return n;
}

function optionalText(value, field, max) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text.length > max) throw httpError(422, `${field} can be at most ${max} characters.`);
  return text || null;
}

/** Accepts normal, short, shorts and embed YouTube links; returns the 11-char video id. */
function youtubeId(url) {
  if (!url) return null;
  const match = String(url).trim().match(
    /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/
  );
  return match ? match[1] : null;
}

function folderOf(recipeId) {
  return `recipes/${recipeId}`;
}

/** A path from the editor must be one of this recipe's own uploaded files. */
function checkOwnPath(recipeId, relativePath) {
  const p = String(relativePath || "");
  const re = new RegExp(`^recipes/${recipeId}/[a-z0-9-]+\\.webp$`);
  if (!re.test(p)) throw httpError(422, "A photo in the recipe is not valid - upload it again.");
  if (!fs.existsSync(resolveInsideUploads(p))) throw httpError(422, "A photo in the recipe is missing - upload it again.");
  return p;
}

async function uniqueSlug(title, exceptId = null) {
  const base = slugify(title).slice(0, 150) || "recipe";
  let slug = base;
  for (let n = 2; ; n += 1) {
    const clash = await prisma.recipe.findUnique({ where: { slug } });
    if (!clash || clash.id === exceptId) return slug;
    slug = `${base}-${n}`;
  }
}

/** Deletes files in the recipe's folder that nothing references any more. */
function removeUnusedFiles(recipeId, keepPaths) {
  const keep = new Set(keepPaths);
  let dir;
  try {
    dir = resolveInsideUploads(folderOf(recipeId));
  } catch {
    return;
  }
  fs.readdir(dir, (err, names) => {
    if (err) return; // folder doesn't exist yet - nothing to clean
    for (const name of names) {
      const rel = `${folderOf(recipeId)}/${name}`;
      if (keep.has(rel)) continue;
      // A photo uploaded moments ago may belong to an editor that hasn't
      // saved yet - leave it; a later save removes it if it's still unused.
      fs.stat(path.join(dir, name), (statErr, st) => {
        if (!statErr && Date.now() - st.mtimeMs > FRESH_UPLOAD_MS) deleteLocalImage(rel);
      });
    }
  });
}

// ---------- admin ----------

async function listRecipes() {
  const recipes = await prisma.recipe.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { ingredients: true, steps: true } } },
  });
  return recipes;
}

async function getRecipe(id) {
  const recipe = await prisma.recipe.findUnique({ where: { id }, include: fullInclude });
  if (!recipe) throw httpError(404, "Recipe not found.");
  return recipe;
}

async function createRecipe({ title }) {
  const clean = String(title || "").trim();
  if (clean.length < 3 || clean.length > 150) throw httpError(422, "Recipe name must be 3 to 150 characters.");
  return prisma.recipe.create({ data: { title: clean, slug: await uniqueSlug(clean) } });
}

/** Saves everything in one go. Lists (photos, ingredients, steps) are replaced. */
async function saveRecipe(id, body) {
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Recipe not found.");

  const title = String(body.title ?? existing.title).trim();
  if (title.length < 3 || title.length > 150) throw httpError(422, "Recipe name must be 3 to 150 characters.");

  const difficulty = body.difficulty || "easy";
  if (!DIFFICULTIES.includes(difficulty)) throw httpError(422, "Choose Easy, Medium or Hard.");

  let videoUrl = null;
  if (body.videoUrl) {
    const id11 = youtubeId(body.videoUrl);
    if (!id11) throw httpError(422, "Video must be a YouTube link (youtube.com or youtu.be).");
    videoUrl = `https://www.youtube.com/watch?v=${id11}`;
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length > MAX_IMAGES) throw httpError(422, `A recipe can have up to ${MAX_IMAGES} photos.`);
  const imagePaths = images.map((img) => checkOwnPath(id, img.path));
  if (new Set(imagePaths).size !== imagePaths.length) throw httpError(422, "The same photo is added twice.");

  const ingredientsIn = Array.isArray(body.ingredients) ? body.ingredients : [];
  if (ingredientsIn.length > MAX_INGREDIENTS) throw httpError(422, `Up to ${MAX_INGREDIENTS} ingredients.`);
  const productIds = [...new Set(ingredientsIn.map((i) => i.productId).filter((v) => v !== undefined && v !== null && v !== ""))].map(Number);
  if (productIds.length) {
    const found = await prisma.product.count({ where: { id: { in: productIds } } });
    if (found !== productIds.length) throw httpError(422, "A linked product no longer exists - pick it again.");
  }
  const ingredients = ingredientsIn.map((ing, index) => {
    const name = String(ing.name || "").trim();
    if (!name) throw httpError(422, `Ingredient ${index + 1} needs a name.`);
    if (name.length > 100) throw httpError(422, `Ingredient ${index + 1}: name can be at most 100 characters.`);
    return {
      name,
      quantity: optionalText(ing.quantity, `Ingredient ${index + 1} quantity`, 30),
      unit: optionalText(ing.unit, `Ingredient ${index + 1} unit`, 20),
      note: optionalText(ing.note, `Ingredient ${index + 1} note`, 100),
      productId: ing.productId ? Number(ing.productId) : null,
      sortOrder: index,
    };
  });

  const stepsIn = Array.isArray(body.steps) ? body.steps : [];
  if (stepsIn.length > MAX_STEPS) throw httpError(422, `Up to ${MAX_STEPS} steps.`);
  const steps = stepsIn.map((step, index) => {
    const text = String(step.text || "").trim();
    if (!text) throw httpError(422, `Step ${index + 1} is empty.`);
    if (text.length > 2000) throw httpError(422, `Step ${index + 1} can be at most 2000 characters.`);
    const flame = step.flame || "none";
    if (!FLAMES.includes(flame)) throw httpError(422, `Step ${index + 1}: choose a flame level.`);
    const imagePath = step.imagePath ? checkOwnPath(id, step.imagePath) : null;
    return {
      text,
      flame,
      minutes: optionalInt(step.minutes, `Step ${index + 1} time`, 0, 600),
      tip: optionalText(step.tip, `Step ${index + 1} tip`, 300),
      imagePath,
      imageUrl: imagePath ? toPublicUrl(imagePath) : null,
      sortOrder: index,
    };
  });

  const isPublished = body.isPublished !== undefined ? Boolean(body.isPublished) : existing.isPublished;
  if (isPublished && (ingredients.length === 0 || steps.length === 0)) {
    throw httpError(422, "Add at least one ingredient and one step before publishing.");
  }

  const data = {
    title,
    slug: title === existing.title ? existing.slug : await uniqueSlug(title, id),
    intro: optionalText(body.intro, "Intro", 2000),
    prepMinutes: optionalInt(body.prepMinutes, "Prep time", 0, 1440),
    cookMinutes: optionalInt(body.cookMinutes, "Cook time", 0, 1440),
    serves: optionalInt(body.serves, "Serves", 1, 50),
    difficulty,
    spiceLevel: optionalInt(body.spiceLevel, "Spice level", 0, 3) ?? 1,
    videoUrl,
    isPublished,
    sortOrder: optionalInt(body.sortOrder, "Order", 0, 9999) ?? existing.sortOrder,
    imageUrl: imagePaths[0] ? toPublicUrl(imagePaths[0]) : null,
  };

  await prisma.$transaction(async (tx) => {
    await tx.recipe.update({ where: { id }, data });
    await tx.recipeImage.deleteMany({ where: { recipeId: id } });
    await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
    await tx.recipeStep.deleteMany({ where: { recipeId: id } });
    if (imagePaths.length) {
      await tx.recipeImage.createMany({
        data: imagePaths.map((p, index) => ({ recipeId: id, path: p, url: toPublicUrl(p), sortOrder: index })),
      });
    }
    if (ingredients.length) await tx.recipeIngredient.createMany({ data: ingredients.map((i) => ({ ...i, recipeId: id })) });
    if (steps.length) await tx.recipeStep.createMany({ data: steps.map((s) => ({ ...s, recipeId: id })) });
  });

  removeUnusedFiles(id, [...imagePaths, ...steps.map((s) => s.imagePath).filter(Boolean)]);
  return getRecipe(id);
}

async function setPublished(id, isPublished) {
  const recipe = await getRecipe(id);
  if (isPublished && (recipe.ingredients.length === 0 || recipe.steps.length === 0)) {
    throw httpError(422, "Add at least one ingredient and one step before publishing.");
  }
  return prisma.recipe.update({ where: { id }, data: { isPublished: Boolean(isPublished) } });
}

async function deleteRecipe(id) {
  const existing = await prisma.recipe.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Recipe not found.");
  await prisma.recipe.delete({ where: { id } });
  try {
    fs.rm(resolveInsideUploads(folderOf(id)), { recursive: true, force: true }, () => {});
  } catch {
    /* folder cleanup is best-effort */
  }
  return existing;
}

/** Processes photos into uploads/recipes/<id>/ and returns [{ path, url }] for the editor. */
async function uploadImages(id, files) {
  if (!files || files.length === 0) throw httpError(422, "Select at least one photo.");
  const recipe = await prisma.recipe.findUnique({ where: { id } });
  if (!recipe) throw httpError(404, "Recipe not found.");
  const base = slugify(recipe.title).slice(0, 60) || "recipe";
  const saved = [];
  try {
    for (let i = 0; i < files.length; i += 1) {
      const { buffer, ext } = await processProductImage(files[i].buffer);
      const rel = `${folderOf(id)}/${base}-${Date.now()}-${i + 1}${ext}`;
      await writeLocalImage(rel, buffer);
      saved.push({ path: rel, url: toPublicUrl(rel) });
    }
  } catch (err) {
    saved.forEach((s) => deleteLocalImage(s.path));
    throw err;
  }
  return saved;
}

// ---------- customer site ----------

function totalMinutes(r) {
  const total = (r.prepMinutes || 0) + (r.cookMinutes || 0);
  return total || null;
}

function card(r) {
  return {
    slug: r.slug,
    title: r.title,
    intro: r.intro ? r.intro.slice(0, 160) : null,
    imageUrl: r.imageUrl,
    totalMinutes: totalMinutes(r),
    serves: r.serves,
    difficulty: r.difficulty,
    spiceLevel: r.spiceLevel,
  };
}

async function listPublished() {
  const recipes = await prisma.recipe.findMany({
    where: { isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
  return recipes.map(card);
}

/**
 * Full recipe for its page. Linked ingredients carry what "Add to cart"
 * needs: the cheapest variant that can be bought right now (null if none).
 */
async function getPublishedBySlug(slug) {
  const recipe = await prisma.recipe.findUnique({
    where: { slug: String(slug) },
    include: {
      images: { orderBy: ordered },
      steps: { orderBy: ordered },
      ingredients: {
        orderBy: ordered,
        include: {
          product: {
            select: {
              id: true, name: true, imageUrl: true, isActive: true, isInStock: true, isCombo: true,
              variants: { where: { isInStock: true }, orderBy: [{ price: "asc" }], select: { id: true, label: true, price: true } },
              optionGroups: { where: { isRequired: true }, select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!recipe || !recipe.isPublished) throw httpError(404, "Recipe not found.");

  const videoId = youtubeId(recipe.videoUrl);
  return {
    ...card(recipe),
    intro: recipe.intro,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    videoId,
    images: recipe.images.map((i) => i.url),
    ingredients: recipe.ingredients.map((ing) => {
      const p = ing.product;
      const buyable = p && p.isActive && p.isInStock && p.variants.length > 0;
      return {
        id: ing.id,
        quantity: ing.quantity,
        unit: ing.unit,
        name: ing.name,
        note: ing.note,
        product: p && p.isActive
          ? {
              id: p.id,
              name: p.name,
              imageUrl: p.imageUrl,
              // Quick "Add to cart" only when no choice is needed; otherwise link to the product.
              quickAdd: buyable && !p.isCombo && p.optionGroups.length === 0
                ? { variantId: p.variants[0].id, label: p.variants[0].label, price: Number(p.variants[0].price) }
                : null,
              available: Boolean(buyable),
            }
          : null,
      };
    }),
    steps: recipe.steps.map((s) => ({ id: s.id, text: s.text, flame: s.flame, minutes: s.minutes, tip: s.tip, imageUrl: s.imageUrl })),
  };
}

/** Published recipes that use any of these products - for the product page. */
async function recipesForProduct(productId) {
  const combo = await prisma.comboItem.findMany({
    where: { comboProductId: productId },
    select: { variant: { select: { productId: true } } },
  });
  const ids = [productId, ...combo.map((c) => c.variant.productId)];
  const recipes = await prisma.recipe.findMany({
    where: { isPublished: true, ingredients: { some: { productId: { in: ids } } } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    take: 6,
  });
  return recipes.map(card);
}

async function hasPublished() {
  return (await prisma.recipe.count({ where: { isPublished: true } })) > 0;
}

module.exports = {
  DIFFICULTIES,
  FLAMES,
  youtubeId,
  listRecipes,
  getRecipe,
  createRecipe,
  saveRecipe,
  setPublished,
  deleteRecipe,
  uploadImages,
  listPublished,
  getPublishedBySlug,
  recipesForProduct,
  hasPublished,
};
