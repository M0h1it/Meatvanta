const multer = require("multer");

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

// Raw upload limit. Files are re-encoded by sharp afterwards (see
// imageProcessor.util.js), so what is actually stored is far smaller.
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// How many files a single upload request may carry. The per-product total is
// enforced separately in products.service (MAX_IMAGES_PER_PRODUCT).
const MAX_FILES_PER_UPLOAD = 6;

/**
 * Files are kept in memory, not written to disk here: every upload is resized
 * and converted to WebP first, and only the processed result is saved.
 * That also means a rejected request (bad product id, over the image limit)
 * never leaves a stray file behind.
 */
function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const err = new Error("Only JPG, PNG, or WEBP images are allowed.");
    err.statusCode = 422;
    err.expose = true;
    return cb(err);
  }
  cb(null, true);
}

const uploadProductImages = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_FILES_PER_UPLOAD },
}).array("images", MAX_FILES_PER_UPLOAD); // form-data field name must be "images"

// ---------- Banners ----------
// Up to three files per banner: the main (desktop) media, an optional phone
// version and an optional cover image for videos. Type and size are checked
// per file in bannerMedia.util.js (videos may be larger than images).
const BANNER_UPLOAD_LIMIT_MB = 15;
const bannerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BANNER_UPLOAD_LIMIT_MB * 1024 * 1024, files: 3 },
}).fields([
  { name: "desktop", maxCount: 1 },
  { name: "mobile", maxCount: 1 },
  { name: "poster", maxCount: 1 },
]);

/** Same as bannerUpload, but turns multer's errors into clear 422 messages for this form. */
function uploadBannerMedia(req, res, next) {
  bannerUpload(req, res, (err) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? `Each file must be ${BANNER_UPLOAD_LIMIT_MB}MB or smaller.`
          : 'Upload files using the "desktop", "mobile" and "poster" fields.';
      const wrapped = new Error(message);
      wrapped.statusCode = 422;
      wrapped.expose = true;
      return next(wrapped);
    }
    return next(err);
  });
}

module.exports = { uploadProductImages, uploadBannerMedia, MAX_FILE_SIZE_MB, MAX_FILES_PER_UPLOAD };
