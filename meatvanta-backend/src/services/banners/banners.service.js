const prisma = require("../../config/db");
const { toPublicUrl, writeLocalImage, deleteLocalImage } = require("../../utils/localImageStorage.util");
const { processBannerFile } = require("../../utils/bannerMedia.util");
const { slugify } = require("../../utils/slugify.util");

/**
 * Offers & banners.
 *
 * Placement = where on the customer site a banner appears. Several banners can
 * share a placement (they rotate as a slider, in sortOrder). A banner is LIVE
 * when it is switched on and "now" is inside its optional schedule. The public
 * endpoint only ever returns live banners, so an empty placement renders nothing.
 */

const PLACEMENTS = [
  "announcement",
  "home_top",
  "home_middle",
  "home_bottom",
  "shop_top",
  "product_page",
  "cart_top",
  "popup",
];
const LINK_TYPES = ["none", "product", "category", "url"];

// Allowed shapes per screen. "auto" = the picture's own shape (never trimmed).
const DESKTOP_RATIOS = ["auto", "4:1", "3:1", "2:1", "16:9", "1:1"];
const MOBILE_RATIOS = ["auto", "2:1", "16:9", "1:1", "4:5"];
const FOCUS_POINTS = ["center", "top", "bottom", "left", "right"];
// Text announcements have no picture, so no shape to set.
const LAYOUT_PLACEMENTS = PLACEMENTS.filter((p) => p !== "announcement");
const DEFAULT_LAYOUT = { desktopRatio: "auto", mobileRatio: "auto", fullWidth: false };

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/** live | scheduled | expired | off - what the admin list shows next to each banner. */
function statusOf(banner, now = new Date()) {
  if (!banner.isActive) return "off";
  if (banner.startsAt && banner.startsAt > now) return "scheduled";
  if (banner.endsAt && banner.endsAt <= now) return "expired";
  return "live";
}

const withStatus = (banner) => ({ ...banner, status: statusOf(banner) });

// ---------- Input parsing (multipart form fields arrive as strings) ----------

function parseBool(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
}

/** "" / null -> null (clears the date), undefined -> undefined (leave unchanged). */
function parseDate(value, field) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw httpError(422, `${field} is not a valid date and time.`);
  return date;
}

/** Accepts only the known focus points; anything else falls back to center. */
function parseFocus(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (!FOCUS_POINTS.includes(value)) throw httpError(422, "Choose which part of the picture to keep in view.");
  return value;
}

function cleanText(value, max) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed.slice(0, max);
}

/**
 * Validates the link and returns what to store. Only http(s) links or paths on
 * our own site are allowed - never "javascript:" or other schemes.
 */
async function resolveLink(linkType, linkValue) {
  if (!LINK_TYPES.includes(linkType)) throw httpError(422, "Choose where the banner should link to.");
  if (linkType === "none") return { linkType, linkValue: null };

  const value = String(linkValue || "").trim();
  if (!value) throw httpError(422, "Choose the product, category or web address the banner opens.");

  if (linkType === "product") {
    const product = await prisma.product.findUnique({ where: { id: Number(value) } });
    if (!product) throw httpError(422, "The product this banner links to doesn't exist.");
    return { linkType, linkValue: String(product.id) };
  }
  if (linkType === "category") {
    const category = await prisma.category.findUnique({ where: { id: Number(value) } });
    if (!category) throw httpError(422, "The category this banner links to doesn't exist.");
    return { linkType, linkValue: String(category.id) };
  }

  const isSitePath = value.startsWith("/") && !value.startsWith("//");
  const isWebLink = /^https?:\/\/[^\s]+$/i.test(value);
  if (!isSitePath && !isWebLink) {
    throw httpError(422, "Links must start with https:// or be a page on this site like /shop.");
  }
  return { linkType, linkValue: value.slice(0, 500) };
}

// ---------- Files ----------

/**
 * Processes and saves whichever of desktop / mobile / poster were uploaded.
 * Returns the DB fields to set plus the list of written paths, so the caller
 * can remove them again if the DB write fails.
 */
async function saveUploadedMedia(files, title) {
  const base = slugify(title || "banner") || "banner";
  const stamp = Date.now();
  const data = {};
  const written = [];
  const types = {};

  try {
    for (const slot of ["desktop", "mobile", "poster"]) {
      const file = files?.[slot]?.[0];
      if (!file) continue;
      const { buffer, ext, mediaType } = await processBannerFile(file, slot);
      const relativePath = `banners/${base}-${stamp}-${slot}${ext}`;
      await writeLocalImage(relativePath, buffer);
      written.push(relativePath);
      types[slot] = mediaType;
      data[`${slot}Path`] = relativePath;
      data[`${slot}Url`] = toPublicUrl(relativePath);
    }
  } catch (err) {
    written.forEach((p) => deleteLocalImage(p));
    throw err;
  }

  return { data, written, types };
}

// ---------- Admin ----------

async function listBanners() {
  const banners = await prisma.banner.findMany({
    orderBy: [{ placement: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return banners.map(withStatus);
}

async function getBanner(id) {
  const banner = await prisma.banner.findUnique({ where: { id } });
  if (!banner) throw httpError(404, "Banner not found.");
  return withStatus(banner);
}

function checkSchedule(startsAt, endsAt) {
  if (startsAt && endsAt && endsAt <= startsAt) {
    throw httpError(422, "The end time must be after the start time.");
  }
}

async function createBanner(body, files) {
  const title = cleanText(body.title, 150);
  if (!title) throw httpError(422, "Give the banner a name (only you will see it).");

  const placement = body.placement;
  if (!PLACEMENTS.includes(placement)) throw httpError(422, "Choose where the banner should appear.");

  const startsAt = parseDate(body.startsAt, "Start") ?? null;
  const endsAt = parseDate(body.endsAt, "End") ?? null;
  checkSchedule(startsAt, endsAt);

  const link = await resolveLink(body.linkType || "none", body.linkValue);
  const isAnnouncement = placement === "announcement";

  const text = cleanText(body.text, 200);
  if (isAnnouncement && !text) throw httpError(422, "Write the announcement text.");
  if (!isAnnouncement && !files?.desktop?.[0]) throw httpError(422, "Upload the banner image or video.");

  // New banners go to the end of their placement's slider.
  const last = await prisma.banner.findFirst({
    where: { placement },
    orderBy: [{ sortOrder: "desc" }, { id: "desc" }],
  });

  const saved = isAnnouncement ? { data: {}, written: [], types: {} } : await saveUploadedMedia(files, title);
  if (saved.types.mobile && saved.types.mobile !== saved.types.desktop) {
    saved.written.forEach((p) => deleteLocalImage(p));
    throw httpError(422, "The phone version must be the same type as the main file (both images or both videos).");
  }

  try {
    const banner = await prisma.banner.create({
      data: {
        title,
        placement,
        text: isAnnouncement ? text : null,
        mediaType: isAnnouncement ? null : saved.types.desktop,
        ...saved.data,
        altText: cleanText(body.altText, 200),
        focus: parseFocus(body.focus) || "center",
        ...link,
        startsAt,
        endsAt,
        isActive: parseBool(body.isActive, true),
        sortOrder: last ? last.sortOrder + 1 : 0,
      },
    });
    return withStatus(banner);
  } catch (err) {
    saved.written.forEach((p) => deleteLocalImage(p));
    throw err;
  }
}

async function updateBanner(id, body, files) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Banner not found.");

  const placement = body.placement ?? existing.placement;
  if (!PLACEMENTS.includes(placement)) throw httpError(422, "Choose where the banner should appear.");
  const isAnnouncement = placement === "announcement";
  if ((existing.placement === "announcement") !== isAnnouncement) {
    throw httpError(422, "A text announcement can't be turned into an image banner (or back). Create a new one instead.");
  }

  const data = {};
  const title = cleanText(body.title, 150);
  if (body.title !== undefined) {
    if (!title) throw httpError(422, "Give the banner a name (only you will see it).");
    data.title = title;
  }
  if (placement !== existing.placement) {
    const last = await prisma.banner.findFirst({ where: { placement }, orderBy: [{ sortOrder: "desc" }, { id: "desc" }] });
    data.placement = placement;
    data.sortOrder = last ? last.sortOrder + 1 : 0;
  }
  if (isAnnouncement && body.text !== undefined) {
    const text = cleanText(body.text, 200);
    if (!text) throw httpError(422, "Write the announcement text.");
    data.text = text;
  }
  if (body.altText !== undefined) data.altText = cleanText(body.altText, 200);
  if (body.focus !== undefined) data.focus = parseFocus(body.focus) || "center";
  if (body.isActive !== undefined) data.isActive = parseBool(body.isActive, existing.isActive);

  const startsAt = parseDate(body.startsAt, "Start");
  const endsAt = parseDate(body.endsAt, "End");
  if (startsAt !== undefined) data.startsAt = startsAt;
  if (endsAt !== undefined) data.endsAt = endsAt;
  checkSchedule(data.startsAt !== undefined ? data.startsAt : existing.startsAt, data.endsAt !== undefined ? data.endsAt : existing.endsAt);

  if (body.linkType !== undefined) Object.assign(data, await resolveLink(body.linkType, body.linkValue));

  // Files: replace what was uploaded, optionally clear the phone version / cover.
  const saved = isAnnouncement ? { data: {}, written: [], types: {} } : await saveUploadedMedia(files, data.title || existing.title);
  Object.assign(data, saved.data);
  const toDelete = [];

  if (saved.types.desktop) {
    data.mediaType = saved.types.desktop;
    if (existing.desktopPath) toDelete.push(existing.desktopPath);
  }
  if (saved.data.mobilePath && existing.mobilePath) toDelete.push(existing.mobilePath);
  if (saved.data.posterPath && existing.posterPath) toDelete.push(existing.posterPath);

  if (!saved.data.mobilePath && parseBool(body.removeMobile, false) && existing.mobilePath) {
    data.mobilePath = null;
    data.mobileUrl = null;
    toDelete.push(existing.mobilePath);
  }
  if (!saved.data.posterPath && parseBool(body.removePoster, false) && existing.posterPath) {
    data.posterPath = null;
    data.posterUrl = null;
    toDelete.push(existing.posterPath);
  }

  // The phone version must be the same kind as the main file. A phone file
  // kept from before has the old main file's type (that rule held when it was saved).
  const finalDesktopType = saved.types.desktop || existing.mediaType;
  let finalMobileType = null;
  if (saved.types.mobile) finalMobileType = saved.types.mobile;
  else if (existing.mobilePath && data.mobilePath !== null) finalMobileType = existing.mediaType;
  if (finalMobileType && finalMobileType !== finalDesktopType) {
    saved.written.forEach((p) => deleteLocalImage(p));
    throw httpError(
      422,
      "The phone version must be the same type as the main file (both images or both videos). Upload a matching one or remove it."
    );
  }

  try {
    const banner = await prisma.banner.update({ where: { id }, data });
    // Old files go only after the DB points at the new ones.
    toDelete.forEach((p) => deleteLocalImage(p));
    return withStatus(banner);
  } catch (err) {
    saved.written.forEach((p) => deleteLocalImage(p));
    throw err;
  }
}

async function deleteBanner(id) {
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Banner not found.");
  await prisma.banner.delete({ where: { id } });
  [existing.desktopPath, existing.mobilePath, existing.posterPath].forEach((p) => deleteLocalImage(p));
  return { deletedId: id };
}

/** Sets the slider order of one placement. ids must be exactly that placement's banners. */
async function reorderBanners(placement, ids) {
  if (!PLACEMENTS.includes(placement)) throw httpError(422, "Unknown placement.");
  const current = await prisma.banner.findMany({ where: { placement }, select: { id: true } });
  const a = current.map((b) => b.id).sort((x, y) => x - y);
  const b = [...ids].sort((x, y) => x - y);
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw httpError(422, "The banner list is out of date. Refresh the page and try again.");
  }
  await prisma.$transaction(ids.map((bannerId, index) => prisma.banner.update({ where: { id: bannerId }, data: { sortOrder: index } })));
  return listBanners();
}

// ---------- Layout (shape of each spot) ----------

/** Every picture spot with its shape - defaults for spots never configured. */
async function getLayouts() {
  const rows = await prisma.bannerPlacementSetting.findMany();
  const saved = Object.fromEntries(rows.map((r) => [r.placement, r]));
  return Object.fromEntries(
    LAYOUT_PLACEMENTS.map((placement) => {
      const row = saved[placement];
      return [
        placement,
        row
          ? { desktopRatio: row.desktopRatio, mobileRatio: row.mobileRatio, fullWidth: row.fullWidth }
          : { ...DEFAULT_LAYOUT },
      ];
    })
  );
}

async function updateLayout(placement, body) {
  if (!LAYOUT_PLACEMENTS.includes(placement)) throw httpError(422, "This spot has no picture shape to set.");
  const desktopRatio = body.desktopRatio ?? "auto";
  const mobileRatio = body.mobileRatio ?? "auto";
  if (!DESKTOP_RATIOS.includes(desktopRatio)) throw httpError(422, "Choose a computer shape from the list.");
  if (!MOBILE_RATIOS.includes(mobileRatio)) throw httpError(422, "Choose a phone shape from the list.");
  const data = { desktopRatio, mobileRatio, fullWidth: Boolean(body.fullWidth) };
  await prisma.bannerPlacementSetting.upsert({
    where: { placement },
    create: { placement, ...data },
    update: data,
  });
  return { placement, ...data };
}

// ---------- Public ----------

/**
 * Live banners only, grouped by placement, in slider order. Only the fields
 * the customer site needs - no file paths or admin-only names.
 */
async function listLiveBanners(now = new Date()) {
  const rows = await prisma.banner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const byPlacement = {};
  for (const b of rows) {
    (byPlacement[b.placement] ||= []).push({
      id: b.id,
      text: b.text,
      mediaType: b.mediaType,
      desktopUrl: b.desktopUrl,
      mobileUrl: b.mobileUrl,
      posterUrl: b.posterUrl,
      altText: b.altText || "",
      focus: b.focus || "center",
      linkType: b.linkType,
      linkValue: b.linkValue,
      // Lets the popup remember "already shown" per version of the banner.
      version: b.updatedAt ? new Date(b.updatedAt).getTime() : 0,
    });
  }
  return byPlacement;
}

module.exports = {
  PLACEMENTS,
  LINK_TYPES,
  DESKTOP_RATIOS,
  MOBILE_RATIOS,
  FOCUS_POINTS,
  getLayouts,
  updateLayout,
  statusOf,
  listBanners,
  getBanner,
  createBanner,
  updateBanner,
  deleteBanner,
  reorderBanners,
  listLiveBanners,
};
