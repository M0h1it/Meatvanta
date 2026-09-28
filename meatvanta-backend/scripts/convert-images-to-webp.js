/**
 * One-time: turns old JPEG/PNG product photos into WebP (max 1200px), the
 * same format every new upload already gets. Typically 60-90% smaller.
 *
 *   node scripts/convert-images-to-webp.js           -> DRY RUN (default): only reports, changes nothing
 *   node scripts/convert-images-to-webp.js --apply   -> writes the .webp files and points the database at them
 *
 * Safe by design:
 *  - Never deletes anything. The original .jpg/.png stays on disk next to the
 *    new .webp, so any old link (a customer's saved cart, a shared URL) keeps
 *    working. Remove the originals yourself later, only if you want the disk space.
 *  - Only touches images stored on this server (UPLOADS_DIR). Images still on
 *    R2 are skipped - run migrate-images-to-local.js first for those.
 *  - Safe to re-run: rows that already point at .webp are skipped, and a .webp
 *    left by an earlier run is reused instead of being made again.
 *  - Each image is updated on its own, so one failure doesn't stop or undo the rest.
 *  - Also refreshes each product's cover (products.image_url) so it matches
 *    the first gallery photo.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/db");
const { UPLOADS_DIR, toPublicUrl, resolveInsideUploads, normalizeRelative } = require("../src/utils/localImageStorage.util");
const { processProductImage } = require("../src/utils/imageProcessor.util");

const APPLY = process.argv.includes("--apply");
const CONVERTIBLE = /\.(jpe?g|png)$/i;

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function localUrlPrefix() {
  const base = (process.env.SERVER_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
  return `${base}/uploads/`;
}

/** "chicken/curry-cut-123.jpeg" -> "chicken/curry-cut-123.webp" */
function webpPathFor(relativePath) {
  // Always saved with "/" (older Windows rows had "chicken\\file.jpeg").
  return normalizeRelative(relativePath).replace(CONVERTIBLE, ".webp");
}

/**
 * Makes (or reuses) the .webp for one stored image.
 * Returns { newPath, before, after, reused } - writes nothing in dry-run mode.
 */
async function convertOne(relativePath) {
  const source = resolveInsideUploads(relativePath);
  if (!fs.existsSync(source)) throw new Error("file not found on disk");
  const before = fs.statSync(source).size;
  const newPath = webpPathFor(relativePath);
  const target = resolveInsideUploads(newPath);

  if (fs.existsSync(target)) {
    return { newPath, before, after: fs.statSync(target).size, reused: true };
  }
  const { buffer } = await processProductImage(fs.readFileSync(source));
  if (APPLY) {
    // "wx": never overwrite anything.
    await fs.promises.writeFile(target, buffer, { flag: "wx" });
  }
  return { newPath, before, after: buffer.length, reused: false };
}

async function main() {
  if (APPLY && !process.env.SERVER_BASE_URL) {
    throw new Error(
      "SERVER_BASE_URL is not set. Set it in .env first (e.g. https://api.meatvanta.com), " +
        "otherwise the database would be filled with http://localhost:4000 URLs."
    );
  }
  console.log(APPLY ? "MODE: APPLY - .webp files will be written and the DB updated.\n" : "MODE: DRY RUN - nothing will be changed. Re-run with --apply to do it.\n");
  console.log(`Uploads folder : ${UPLOADS_DIR}\n`);

  const prefix = localUrlPrefix();
  const images = await prisma.productImage.findMany({
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    include: { product: { select: { name: true } } },
  });

  const summary = { converted: 0, reused: 0, alreadyWebp: 0, notLocal: 0, failed: 0, before: 0, after: 0 };
  const touchedProducts = new Set();

  for (const image of images) {
    const label = `#${image.id} ${image.product?.name || `product ${image.productId}`}`;
    if (!image.path || !CONVERTIBLE.test(image.path)) {
      if (image.path && /\.webp$/i.test(image.path)) summary.alreadyWebp += 1;
      else if (!image.path) {
        summary.notLocal += 1;
        console.log(`  skip    ${label}: no local file path (still on R2? run migrate-images-to-local.js first)`);
      }
      continue;
    }
    if (!image.url.startsWith(prefix)) {
      summary.notLocal += 1;
      console.log(`  skip    ${label}: URL is not on this server (${image.url.slice(0, 60)}…) - run migrate-images-to-local.js first`);
      continue;
    }

    try {
      const result = await convertOne(image.path);
      summary.before += result.before;
      summary.after += result.after;
      if (result.reused) summary.reused += 1;
      else summary.converted += 1;
      const saved = result.before > 0 ? Math.round((1 - result.after / result.before) * 100) : 0;
      console.log(`  ${APPLY ? "done" : "would"}    ${label}: ${image.path} ${kb(result.before)} -> ${path.basename(result.newPath)} ${kb(result.after)} (-${saved}%)`);

      if (APPLY) {
        await prisma.productImage.update({
          where: { id: image.id },
          data: { path: result.newPath, url: toPublicUrl(result.newPath) },
        });
        touchedProducts.add(image.productId);
      }
    } catch (err) {
      summary.failed += 1;
      console.log(`  FAILED  ${label}: ${image.path} - ${err.message}`);
    }
  }

  // Cover image = mirror of the first gallery photo (same rule the app uses).
  if (APPLY && touchedProducts.size > 0) {
    for (const productId of touchedProducts) {
      try {
        const first = await prisma.productImage.findFirst({
          where: { productId },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        });
        if (first) {
          await prisma.product.update({ where: { id: productId }, data: { imageUrl: first.url, imagePath: first.path } });
        }
      } catch (err) {
        console.log(`  FAILED  cover of product ${productId}: ${err.message}`);
      }
    }
    console.log(`\nCovers refreshed for ${touchedProducts.size} product(s).`);
  }

  console.log("\n---------- Summary ----------");
  console.log(`Converted       : ${summary.converted}${APPLY ? "" : " (would be)"}`);
  console.log(`Reused .webp    : ${summary.reused} (made by an earlier run)`);
  console.log(`Already WebP    : ${summary.alreadyWebp}`);
  console.log(`Not on server   : ${summary.notLocal}`);
  console.log(`Failed          : ${summary.failed}`);
  if (summary.before > 0) {
    const pct = Math.round((1 - summary.after / summary.before) * 100);
    console.log(`Size            : ${mb(summary.before)} -> ${mb(summary.after)} (-${pct}%)`);
  }
  if (!APPLY) console.log("\nNothing was changed. If Failed is 0, run again with --apply.");
  else console.log("\nOriginal .jpg/.png files were kept. Check the site first; delete them later only if you need the space.");
}

main()
  .catch((err) => {
    console.error("\nStopped:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
