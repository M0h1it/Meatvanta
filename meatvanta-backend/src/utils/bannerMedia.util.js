const sharp = require("sharp");

/**
 * Prepares uploaded banner media for the customer site.
 *
 *  - JPG / PNG / WebP -> resized WebP (EXIF/GPS removed, phone rotation applied)
 *  - GIF              -> ANIMATED WebP: same animation, usually 3-5x smaller
 *  - MP4 / WebM       -> kept exactly as uploaded (re-encoding video is far too
 *                        heavy for the VPS), after checking it really is a video
 */

const IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"];
const GIF_MIME = "image/gif";
const VIDEO_MIME = { "video/mp4": ".mp4", "video/webm": ".webm" };

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 15;
const MAX_INPUT_PIXELS = 50 * 1000 * 1000;

// Longest side kept for each slot. Desktop banners run full page width.
const MAX_DIMENSION = { desktop: 2400, mobile: 1200, poster: 1600 };

function mediaError(message) {
  const err = new Error(message);
  err.statusCode = 422;
  err.expose = true;
  return err;
}

/** "image" | "gif" | "video" | null - from the browser-reported type. */
function kindOf(file) {
  if (IMAGE_MIME.includes(file.mimetype)) return "image";
  if (file.mimetype === GIF_MIME) return "gif";
  if (VIDEO_MIME[file.mimetype]) return "video";
  return null;
}

/**
 * Checks the file's first bytes, not just its name/type, so a renamed file
 * can't be passed off as a video. MP4: "ftyp" at byte 4. WebM: EBML header 1A 45 DF A3.
 */
function looksLikeVideo(buffer, mimetype) {
  if (mimetype === "video/mp4") return buffer.length > 12 && buffer.toString("ascii", 4, 8) === "ftyp";
  if (mimetype === "video/webm") return buffer.length > 4 && buffer.readUInt32BE(0) === 0x1a45dfa3;
  return false;
}

/**
 * @param {object} file   multer memory file
 * @param {"desktop"|"mobile"|"poster"} slot
 * @returns {{ buffer, ext, mediaType: "image"|"video" }}
 */
async function processBannerFile(file, slot) {
  const kind = kindOf(file);
  if (!kind) throw mediaError(`"${file.originalname}" must be a JPG, PNG, WebP, GIF, MP4 or WebM file.`);

  if (slot === "poster" && kind !== "image") {
    throw mediaError("The video cover must be a JPG, PNG or WebP image.");
  }

  if (kind === "video") {
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw mediaError(`Videos must be ${MAX_VIDEO_MB}MB or smaller.`);
    if (!looksLikeVideo(file.buffer, file.mimetype)) {
      throw mediaError(`"${file.originalname}" is not a valid MP4 or WebM video.`);
    }
    return { buffer: file.buffer, ext: VIDEO_MIME[file.mimetype], mediaType: "video" };
  }

  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw mediaError(`Images must be ${MAX_IMAGE_MB}MB or smaller.`);

  const max = MAX_DIMENSION[slot] || MAX_DIMENSION.desktop;
  try {
    const pipeline = sharp(file.buffer, { animated: kind === "gif", limitInputPixels: MAX_INPUT_PIXELS });
    if (kind === "image") pipeline.rotate();
    const buffer = await pipeline
      .resize({ width: max, height: max, fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "gif" ? 70 : 80, effort: 4 })
      .toBuffer();
    return { buffer, ext: ".webp", mediaType: "image" };
  } catch (err) {
    throw mediaError(`"${file.originalname}" could not be read as an image.`);
  }
}

module.exports = { processBannerFile, MAX_IMAGE_MB, MAX_VIDEO_MB };
