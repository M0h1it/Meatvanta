/**
 * One-time: moves product images from Cloudflare R2 to local disk (UPLOADS_DIR)
 * and points the database at the new local URLs.
 *
 *   node scripts/migrate-images-to-local.js           -> DRY RUN (default): only reports, changes nothing
 *   node scripts/migrate-images-to-local.js --apply   -> downloads/copies files and updates the DB
 *
 * Safe by design:
 *  - Never deletes anything: not in the DB, not on disk, not in R2.
 *  - A file that already exists locally (same relative path) is reused, not downloaded again.
 *  - Safe to re-run: images already on a local URL are skipped.
 *  - Each image is updated on its own, so one failure does not stop or undo the rest.
 *
 * Needs the product_images migration applied first (npx prisma migrate deploy).
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/db");
const { UPLOADS_DIR, toPublicUrl, resolveInsideUploads, normalizeRelative } = require("../src/utils/localImageStorage.util");

const APPLY = process.argv.includes("--apply");
const DOWNLOAD_TIMEOUT_MS = 30000;

function localUrlPrefix() {
  const base = (process.env.SERVER_BASE_URL || "http://localhost:4000").replace(/\/$/, "");
  return `${base}/uploads/`;
}

/** Relative path to store the file under: the existing key if we have one, else the URL's path. */
function relativePathFor(image) {
  // normalizeRelative: old Windows rows use "chicken\\file.jpeg" - saved back as "chicken/file.jpeg".
  if (image.path) return normalizeRelative(image.path);
  return decodeURIComponent(new URL(image.url).pathname).replace(/^\/+/, "");
}

async function download(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) throw new Error(`not an image (content-type: ${type || "none"})`);
    return Buffer.from(await res.arrayBuffer());
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  if (APPLY && !process.env.SERVER_BASE_URL) {
    throw new Error(
      "SERVER_BASE_URL is not set. Set it in .env first (e.g. https://api.meatvanta.com), " +
        "otherwise the database would be filled with http://localhost:4000 URLs."
    );
  }

  console.log(APPLY ? "MODE: APPLY - files will be written and the DB updated.\n" : "MODE: DRY RUN - nothing will be changed. Re-run with --apply to do it.\n");
  console.log(`Uploads folder : ${UPLOADS_DIR}`);
  console.log(`New URLs start : ${localUrlPrefix()}\n`);

  const images = await prisma.productImage.findMany({
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    include: { product: { select: { name: true } } },
  });

  const stats = { alreadyLocal: 0, reused: 0, downloaded: 0, failed: 0 };
  const prefix = localUrlPrefix();

  for (const image of images) {
    const label = `#${image.id} ${image.product?.name || `product ${image.productId}`}`;

    if (image.url.startsWith(prefix)) {
      stats.alreadyLocal += 1;
      continue;
    }

    try {
      const rel = relativePathFor(image);
      const fullPath = resolveInsideUploads(rel);
      const existsLocally = fs.existsSync(fullPath);

      if (existsLocally) {
        console.log(`  reuse     ${label} -> ${rel} (file already in uploads folder)`);
      } else {
        // Download even in dry-run, so a broken R2 link shows up before --apply.
        const buffer = await download(image.url);
        if (APPLY) {
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.promises.writeFile(fullPath, buffer, { flag: "wx" });
        }
        console.log(`  ${APPLY ? "download " : "would get"} ${label} -> ${rel} (${Math.round(buffer.length / 1024)} KB)`);
      }

      if (APPLY) {
        await prisma.productImage.update({
          where: { id: image.id },
          data: { path: rel, url: toPublicUrl(rel) },
        });
      }

      if (existsLocally) stats.reused += 1;
      else stats.downloaded += 1;
    } catch (err) {
      stats.failed += 1;
      console.log(`  FAILED    ${label} (${image.url}): ${err.message}`);
    }
  }

  // Re-mirror each product's cover (first gallery image) onto products.image_url / image_path.
  let coversUpdated = 0;
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      imageUrl: true,
      imagePath: true,
      images: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], take: 1 },
    },
  });

  const orphanCovers = [];
  for (const product of products) {
    const cover = product.images[0];
    if (!cover) {
      if (product.imageUrl) orphanCovers.push(product);
      continue;
    }
    if (APPLY && (product.imageUrl !== cover.url || product.imagePath !== cover.path)) {
      await prisma.product.update({
        where: { id: product.id },
        data: { imageUrl: cover.url, imagePath: cover.path },
      });
      coversUpdated += 1;
    }
  }

  console.log("\n---------------- Summary ----------------");
  console.log(`Already local (skipped) : ${stats.alreadyLocal}`);
  console.log(`Reused existing file    : ${stats.reused}`);
  console.log(`Downloaded from R2      : ${stats.downloaded}`);
  console.log(`Failed                  : ${stats.failed}`);
  if (APPLY) console.log(`Product covers updated  : ${coversUpdated}`);
  if (orphanCovers.length) {
    console.log(`\nProducts with an image URL but no gallery rows (check manually):`);
    orphanCovers.forEach((p) => console.log(`  - #${p.id} ${p.name}: ${p.imageUrl}`));
  }
  if (!APPLY) console.log("\nDry run only. Nothing was changed.");

  if (stats.failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error("\nERROR:", err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
