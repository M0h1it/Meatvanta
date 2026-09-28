const prisma = require("../../config/db");

/**
 * Product "merchandising": the labels shown on product cards.
 *  - Manual tags per product ("Eid Special", "New") with colour, schedule and
 *    an optional countdown ("deal").
 *  - An automatic "Bestseller" tag on the products that sold the most
 *    (delivered orders only) over the last N days.
 */

const TAG_COLORS = ["red", "gold", "green", "blue", "dark"];
const MAX_TAGS_PER_PRODUCT = 5;
const BESTSELLER_KEY = "auto_bestseller";
const DEFAULT_BESTSELLER = { enabled: true, count: 4, days: 30, label: "Bestseller", minUnits: 3 };
const CACHE_MS = 10 * 60 * 1000; // recomputed at most every 10 minutes

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function parseDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw httpError(422, `${field} is not a valid date and time.`);
  return d;
}

// ---------- Manual tags ----------

function buildTagData(body, existing = null) {
  const data = {};
  if (body.label !== undefined || !existing) {
    const label = String(body.label || "").trim();
    if (label.length < 1 || label.length > 30) throw httpError(422, "Tag text must be 1 to 30 characters.");
    data.label = label;
  }
  if (body.color !== undefined || !existing) {
    const color = body.color || "red";
    if (!TAG_COLORS.includes(color)) throw httpError(422, "Choose one of the tag colours.");
    data.color = color;
  }
  const startsAt = parseDate(body.startsAt, "Start");
  const endsAt = parseDate(body.endsAt, "End");
  if (startsAt !== undefined) data.startsAt = startsAt;
  if (endsAt !== undefined) data.endsAt = endsAt;
  if (body.showCountdown !== undefined) data.showCountdown = Boolean(body.showCountdown);

  const finalStart = data.startsAt !== undefined ? data.startsAt : existing?.startsAt ?? null;
  const finalEnd = data.endsAt !== undefined ? data.endsAt : existing?.endsAt ?? null;
  const finalCountdown = data.showCountdown !== undefined ? data.showCountdown : existing?.showCountdown ?? false;
  if (finalStart && finalEnd && finalEnd <= finalStart) throw httpError(422, "The end time must be after the start time.");
  if (finalCountdown && !finalEnd) throw httpError(422, "A countdown needs an end time - set when the deal ends.");
  return data;
}

async function addTag(productId, body) {
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw httpError(404, "Product not found.");
  const count = await prisma.productTag.count({ where: { productId } });
  if (count >= MAX_TAGS_PER_PRODUCT) throw httpError(422, `A product can have up to ${MAX_TAGS_PER_PRODUCT} tags. Delete one first.`);
  return prisma.productTag.create({ data: { productId, sortOrder: count, ...buildTagData(body) } });
}

async function updateTag(tagId, body) {
  const existing = await prisma.productTag.findUnique({ where: { id: tagId } });
  if (!existing) throw httpError(404, "Tag not found.");
  return prisma.productTag.update({ where: { id: tagId }, data: buildTagData(body, existing) });
}

async function deleteTag(tagId) {
  const existing = await prisma.productTag.findUnique({ where: { id: tagId } });
  if (!existing) throw httpError(404, "Tag not found.");
  await prisma.productTag.delete({ where: { id: tagId } });
  return existing;
}

/** Tags that should show right now (inside their optional schedule). */
function liveTags(tags = [], now = new Date()) {
  return tags
    .filter((t) => (!t.startsAt || new Date(t.startsAt) <= now) && (!t.endsAt || new Date(t.endsAt) > now))
    .map((t) => ({ id: t.id, label: t.label, color: t.color, endsAt: t.endsAt, showCountdown: t.showCountdown }));
}

// ---------- Automatic "Bestseller" ----------

let cache = { at: 0, key: "", ids: new Set() };

async function getBestsellerSettings() {
  const row = await prisma.siteSetting.findUnique({ where: { key: BESTSELLER_KEY } });
  return { ...DEFAULT_BESTSELLER, ...(row?.value || {}) };
}

async function updateBestsellerSettings(body) {
  const current = await getBestsellerSettings();
  const next = { ...current };
  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled);
  if (body.count !== undefined) {
    const n = Number(body.count);
    if (!Number.isInteger(n) || n < 1 || n > 20) throw httpError(422, "Number of bestsellers must be 1 to 20.");
    next.count = n;
  }
  if (body.days !== undefined) {
    const n = Number(body.days);
    if (!Number.isInteger(n) || n < 7 || n > 365) throw httpError(422, "Look back 7 to 365 days.");
    next.days = n;
  }
  if (body.label !== undefined) {
    const label = String(body.label).trim();
    if (label.length < 1 || label.length > 30) throw httpError(422, "Label must be 1 to 30 characters.");
    next.label = label;
  }
  await prisma.siteSetting.upsert({
    where: { key: BESTSELLER_KEY },
    create: { key: BESTSELLER_KEY, value: next },
    update: { value: next },
  });
  cache = { at: 0, key: "", ids: new Set() }; // recompute with the new settings
  return next;
}

/**
 * Ids of the top-selling products (by units, delivered orders, last N days).
 * A product needs at least `minUnits` sold, so one early sale doesn't make a
 * "bestseller". Cached for 10 minutes.
 */
async function getBestsellerIds(settings, now = Date.now()) {
  const key = `${settings.count}:${settings.days}:${settings.minUnits}`;
  if (cache.key === key && now - cache.at < CACHE_MS) return cache.ids;

  const since = new Date(now - settings.days * 24 * 60 * 60 * 1000);
  const items = await prisma.orderItem.findMany({
    where: { order: { status: "delivered", createdAt: { gte: since } } },
    select: { quantity: true, productVariant: { select: { productId: true } } },
  });
  const units = new Map();
  for (const item of items) {
    const productId = item.productVariant?.productId;
    if (productId) units.set(productId, (units.get(productId) || 0) + Number(item.quantity || 0));
  }
  const ids = new Set(
    [...units.entries()]
      .filter(([, u]) => u >= settings.minUnits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, settings.count)
      .map(([id]) => id)
  );
  cache = { at: now, key, ids };
  return ids;
}

/**
 * Adds `tags` (live only) and `autoTags` to products for the customer site.
 * Never throws: if the bestseller lookup fails, products still load without it.
 */
async function decorateProducts(products) {
  let bestsellerIds = new Set();
  let label = DEFAULT_BESTSELLER.label;
  try {
    const settings = await getBestsellerSettings();
    label = settings.label;
    if (settings.enabled) bestsellerIds = await getBestsellerIds(settings);
  } catch (err) {
    console.error("[merch] bestseller lookup failed:", err.message);
  }
  const now = new Date();
  return products.map((p) => {
    const tags = liveTags(p.tags, now);
    const hasSame = tags.some((t) => t.label.toLowerCase() === label.toLowerCase());
    return { ...p, tags, autoTags: bestsellerIds.has(p.id) && !hasSame ? [label] : [] };
  });
}

module.exports = {
  TAG_COLORS,
  MAX_TAGS_PER_PRODUCT,
  addTag,
  updateTag,
  deleteTag,
  liveTags,
  getBestsellerSettings,
  updateBestsellerSettings,
  getBestsellerIds,
  decorateProducts,
};
