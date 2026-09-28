const fs = require("fs");
const path = require("path");

/**
 * Where uploaded images live on disk.
 *
 * - Production sets UPLOADS_DIR to a folder OUTSIDE the git checkout
 *   (e.g. /var/www/meatvanta-uploads) so a deploy, re-clone or `git clean`
 *   can never touch customer-facing images.
 * - Local development leaves it unset and falls back to backend/uploads.
 */
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, "..", "..", "uploads");

/** "chicken\\a.jpeg" or "/chicken/a.jpeg" -> "chicken/a.jpeg" */
function normalizeRelative(relativePath) {
  return String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
}

/** relativePath e.g. "chicken/chicken-curry-cut-1719900000000.webp" -> full public URL */
function toPublicUrl(relativePath) {
  const base = (process.env.SERVER_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
  return `${base}/uploads/${normalizeRelative(relativePath).split(path.sep).join("/")}`;
}

/**
 * Resolves a stored relative path to an absolute one, refusing anything that
 * would escape UPLOADS_DIR (e.g. "../../.env"). Paths come from our own DB,
 * but a delete should never be able to reach outside the uploads folder.
 */
function resolveInsideUploads(relativePath) {
  // Some older rows were saved on Windows as "chicken\\file.jpeg". On the
  // Linux server "\\" is not a folder separator, so always use "/".
  const fullPath = path.resolve(UPLOADS_DIR, normalizeRelative(relativePath));
  if (fullPath !== UPLOADS_DIR && !fullPath.startsWith(UPLOADS_DIR + path.sep)) {
    throw new Error(`Refusing path outside uploads folder: ${relativePath}`);
  }
  return fullPath;
}

/** Writes a buffer under UPLOADS_DIR, creating the folder if needed. Never overwrites. */
async function writeLocalImage(relativePath, buffer) {
  const fullPath = resolveInsideUploads(relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  // "wx" = fail if the file already exists, so two uploads can never clobber each other.
  await fs.promises.writeFile(fullPath, buffer, { flag: "wx" });
  return fullPath;
}

/** Best-effort delete - never let a failed cleanup block the main request. */
function deleteLocalImage(relativePath) {
  if (!relativePath) return;
  let fullPath;
  try {
    fullPath = resolveInsideUploads(relativePath);
  } catch (err) {
    console.error("[localImageStorage]", err.message);
    return;
  }
  fs.unlink(fullPath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.error("[localImageStorage] failed to delete file:", err.message);
    }
  });
}

module.exports = { UPLOADS_DIR, toPublicUrl, writeLocalImage, deleteLocalImage, resolveInsideUploads, normalizeRelative };
