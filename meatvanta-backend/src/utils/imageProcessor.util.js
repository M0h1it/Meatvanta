const sharp = require("sharp");

// Longest side after resizing. Product pages show images at most ~600px wide
// (1200px on retina screens), so anything larger is wasted bandwidth on mobile data.
const MAX_DIMENSION = 1200;
// 75 + effort 5: roughly half the size of a typical product JPEG with no
// visible difference at product-page sizes. Higher effort = smaller file but
// slower encoding; 5 keeps a 6-image upload quick on a small VPS.
const WEBP_QUALITY = 75;
const WEBP_EFFORT = 5;

// Guards against "decompression bomb" files: tiny on disk, gigantic in memory.
// 50 megapixels comfortably covers any phone camera.
const MAX_INPUT_PIXELS = 50 * 1000 * 1000;

/**
 * Turns an uploaded photo into a web-ready WebP:
 *  - rotate()      applies the phone's EXIF orientation, so photos never show sideways
 *  - resize()      shrinks to MAX_DIMENSION on the longest side, never enlarges
 *  - webp()        a 3-4 MB phone photo typically becomes ~150-250 KB
 *  - metadata      sharp drops EXIF by default, which removes GPS location and
 *                  camera details that phone photos carry
 *
 * Throws a 422 (shown to the admin) if the file is not a readable image,
 * e.g. a renamed PDF or a corrupted upload.
 */
async function processProductImage(inputBuffer, maxDimension = MAX_DIMENSION) {
  try {
    const buffer = await sharp(inputBuffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: maxDimension,
        height: maxDimension,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toBuffer();

    return { buffer, ext: ".webp", contentType: "image/webp" };
  } catch (err) {
    const error = new Error("One of the files is not a valid image, or it is too large to process.");
    error.statusCode = 422;
    error.expose = true;
    error.cause = err;
    throw error;
  }
}

module.exports = { processProductImage, MAX_DIMENSION };
