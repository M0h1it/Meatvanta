/**
 * SEO + AI-discoverability service.
 *
 * The customer site is a client-rendered React app: the raw HTML it ships has
 * no heading, text or links, so crawlers that do not run JavaScript (Bing,
 * social previews, ChatGPT / Perplexity / Claude browsing, SEO checkers) see an
 * empty page. This service fixes that WITHOUT changing the React app:
 *
 *   - renderPage(path)  reads the built customer index.html and returns it with
 *                       a per-URL <title>, description, canonical, Open Graph,
 *                       JSON-LD (Product, Breadcrumb, FAQ, Recipe) and a
 *                       crawlable text block inside <div id="root">. React
 *                       replaces that block as soon as it mounts, so visitors
 *                       never notice it.
 *   - buildSitemap()    live sitemap.xml (every product and recipe)
 *   - buildLlmsTxt()    llms.txt - a plain-text summary written for AI assistants
 *
 * Everything is read-only and cached for a short time so bot crawls cannot
 * hammer the database.
 */
const fs = require("fs");
const path = require("path");
const prisma = require("../../config/db");
const { getShopInfo } = require("../shopInfo/shopInfo.service");
const { getSettings } = require("../deliverySettings/deliverySettings.service");

const SITE_URL = (process.env.SITE_URL || "https://meatvanta.com").replace(/\/+$/, "");
const DIST_DIR = process.env.CUSTOMER_DIST_DIR
  ? path.resolve(process.env.CUSTOMER_DIST_DIR)
  : path.resolve(__dirname, "../../../../customer/dist");
const CACHE_MS = 60 * 1000;
const SITE_NAME = "Meat Vanta";
const DEFAULT_IMAGE = `${SITE_URL}/og-image.jpg`;

// Pages that must never appear in search results (private or per-user).
const PRIVATE_PREFIXES = ["/cart", "/checkout", "/order-confirmation", "/my-orders", "/account", "/track"];
const STATIC_PAGES = ["/", "/shop", "/recipes", "/about", "/contact", "/faq", "/delivery"];

/* ----------------------------- small helpers ----------------------------- */

const cache = new Map();
async function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await loader();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function clip(text, max) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

function jsonLd(obj) {
  // "<" is escaped so a product name can never close the <script> tag.
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function absUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
}

function formatTime12(hhmm) {
  const [h, m] = String(hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}

/* ------------------------------ data loading ----------------------------- */

async function loadContext() {
  return cached("ctx", async () => {
    const [shop, delivery] = await Promise.all([getShopInfo(), getSettings()]);
    const window = `${formatTime12(delivery.deliveryStartTime)} – ${formatTime12(delivery.deliveryEndTime)}`;
    return { shop, delivery, window };
  });
}

async function loadCatalog() {
  return cached("catalog", async () => {
    const [categories, products] = await Promise.all([
      prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        include: {
          category: true,
          variants: { orderBy: { sortOrder: "asc" } },
          images: { orderBy: { sortOrder: "asc" } },
        },
      }),
    ]);

    const shaped = products.map((p) => {
      const priced = p.variants.filter((v) => v.isInStock);
      const pool = priced.length ? priced : p.variants;
      const prices = pool.map((v) => money(v.price)).filter((n) => n > 0);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        categoryName: p.category?.name,
        categoryId: p.categoryId,
        categorySlug: p.category?.slug,
        isInStock: p.isInStock && priced.length > 0,
        isCombo: p.isCombo,
        image: absUrl(p.images[0]?.url || p.imageUrl),
        images: p.images.map((i) => absUrl(i.url)),
        variants: p.variants.map((v) => ({ label: v.label, price: money(v.price), inStock: v.isInStock })),
        minPrice: prices.length ? Math.min(...prices) : null,
        maxPrice: prices.length ? Math.max(...prices) : null,
        updatedAt: p.updatedAt,
      };
    });

    const activeCategoryIds = new Set(categories.map((c) => c.slug));
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug, image: absUrl(c.imageUrl) })),
      products: shaped.filter((p) => activeCategoryIds.has(p.categorySlug)),
    };
  });
}

async function loadRecipes() {
  return cached("recipes", () =>
    prisma.recipe.findMany({
      where: { isPublished: true },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: { slug: true, title: true, intro: true, imageUrl: true, updatedAt: true },
    })
  );
}

async function loadRecipe(slug) {
  return cached(`recipe:${slug}`, () =>
    prisma.recipe.findFirst({
      where: { slug, isPublished: true },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        ingredients: { orderBy: { sortOrder: "asc" } },
        steps: { orderBy: { sortOrder: "asc" } },
      },
    })
  );
}

/* ----------------------------- FAQ (shared) ------------------------------ */

// Keep these answers in step with customer/src/features/content/pages/FaqPage.jsx.
function buildFaqs({ shop, delivery, window }) {
  const phone = shop.phone ? ` on ${shop.phone}` : "";
  const charge =
    delivery.deliveryChargeMode === "flat"
      ? money(delivery.flatDeliveryCharge) > 0
        ? `A flat delivery charge of ₹${money(delivery.flatDeliveryCharge)} is added at checkout.`
        : "Delivery is free."
      : "Delivery is charged based on your address and shown on your order details.";
  const pay = [
    delivery.codEnabled ? "Cash on delivery" : null,
    "online payment (UPI, cards and netbanking via Razorpay)",
  ]
    .filter(Boolean)
    .join(" or ");
  return [
    {
      q: "How fresh is the meat?",
      a: `Meat is bought fresh at market every morning and your order is cut and prepared after it comes in, never portioned in advance. That is why deliveries run in the ${window} window.`,
    },
    { q: "When will my order arrive?", a: `Deliveries go out between ${window} on the date you choose at checkout.` },
    { q: "How much is delivery?", a: charge },
    { q: "How do I pay?", a: `You can pay with ${pay}.` },
    {
      q: "Can I change or cancel my order?",
      a: `Call us as soon as possible${phone}. Since everything is cut fresh to order, we can usually help if the meat has not been prepared yet.`,
    },
    {
      q: "Is the meat halal?",
      a: "Yes. Everything is sourced and prepared to halal standards, the same way it has been for decades.",
    },
    {
      q: "Do you take bulk or party orders?",
      a: `Yes. For large quantities${phone ? `, call us${phone}` : ", contact us"} so we can plan the procurement and confirm timing.`,
    },
    { q: "Which areas do you deliver to?", a: delivery.deliveryAreaNote || "We deliver across Gurugram." },
  ];
}

/* ------------------------------- page model ------------------------------ */

function links(items) {
  return `<ul>${items.map((i) => `<li><a href="${esc(i.href)}">${esc(i.text)}</a>${i.note ? ` – ${esc(i.note)}` : ""}</li>`).join("")}</ul>`;
}

function mainNav() {
  return `<nav aria-label="Main">${links([
    { href: "/", text: "Home" },
    { href: "/shop", text: "Shop fresh meat" },
    { href: "/recipes", text: "Recipes" },
    { href: "/about", text: "About us" },
    { href: "/contact", text: "Contact" },
    { href: "/faq", text: "FAQs" },
    { href: "/delivery", text: "Delivery information" },
  ])}</nav>`;
}

function productLine(p) {
  const price = p.minPrice ? `from ₹${p.minPrice}` : "";
  return { href: `/product/${p.id}`, text: p.name, note: [p.categoryName, price].filter(Boolean).join(", ") };
}

function breadcrumb(items) {
  return jsonLd({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${SITE_URL}${it.path}`,
    })),
  });
}

/** Returns { status, title, description, path, image, noindex, schema[], body } for a URL path. */
async function buildPageModel(rawPath) {
  const p = (rawPath || "/").split("?")[0].replace(/\/{2,}/g, "/").replace(/(.)\/+$/, "$1") || "/";
  const ctx = await loadContext();
  const { shop, delivery, window } = ctx;
  const shopName = shop.shopName || SITE_NAME;

  if (PRIVATE_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`))) {
    return { status: 200, path: p, noindex: true, title: `${shopName}`, description: null, schema: [], body: null };
  }

  /* Home */
  if (p === "/") {
    const { categories, products } = await loadCatalog();
    const faqs = buildFaqs(ctx);
    return {
      status: 200,
      path: p,
      title: "Fresh Halal Meat Delivery in Gurugram | Meat Vanta",
      description: `Order fresh halal chicken, mutton and kebabs online. Cut every morning and delivered across Gurugram, ${window}. ${shop.yearsInBusiness ? `${shop.yearsInBusiness}+ years of trust.` : ""}`.trim(),
      schema: [
        jsonLd({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: shopName,
          url: `${SITE_URL}/`,
          potentialAction: {
            "@type": "SearchAction",
            target: `${SITE_URL}/shop?q={search_term_string}`,
            "query-input": "required name=search_term_string",
          },
        }),
      ],
      body: `
        <h1>Fresh halal meat delivered in Gurugram – ${esc(shopName)}</h1>
        <p>${esc(shopName)} sells fresh halal chicken, mutton and kebabs, cut to order every morning and delivered across Gurugram between ${esc(window)}. ${shop.yearsInBusiness ? `We have been serving families for more than ${esc(shop.yearsInBusiness)} years. ` : ""}Never frozen, never portioned in advance.</p>
        ${mainNav()}
        <h2>Shop by category</h2>
        ${links(categories.map((c) => ({ href: `/shop?category=${c.id}`, text: c.name })))}
        <h2>Popular products</h2>
        ${links(products.filter((x) => x.isInStock).slice(0, 12).map(productLine))}
        <h2>Why order from ${esc(shopName)}?</h2>
        <p>Meat is bought fresh at market every morning, cut after your order comes in, and delivered the same morning in the ${esc(window)} window. Everything is halal.</p>
        <h2>Delivery in Gurugram</h2>
        <p>${esc(delivery.deliveryAreaNote || "We deliver across Gurugram.")} Read the <a href="/delivery">delivery information</a> or the <a href="/faq">FAQs</a> (${esc(faqs.length)} answers).</p>
        <h2>Visit or call us</h2>
        <p>${esc(shop.addressLine || "")}${shop.phone ? ` · Phone ${esc(shop.phone)}` : ""}</p>`,
    };
  }

  /* Shop */
  if (p === "/shop") {
    const { categories, products } = await loadCatalog();
    return {
      status: 200,
      path: p,
      title: "Buy Fresh Halal Meat Online in Gurugram | Meat Vanta",
      description: `Browse fresh halal chicken, mutton, kebabs and more with prices. Order online from ${shopName} for morning delivery in Gurugram.`,
      schema: [breadcrumb([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }])],
      body: `
        <h1>Shop fresh halal meat online</h1>
        <p>All products are cut fresh to order and delivered across Gurugram in the ${esc(window)} window.</p>
        ${mainNav()}
        ${categories
          .map((c) => {
            const items = products.filter((x) => x.categorySlug === c.slug);
            if (!items.length) return "";
            return `<h2>${esc(c.name)}</h2>${links(items.map(productLine))}`;
          })
          .join("")}`,
    };
  }

  /* Product */
  const productMatch = p.match(/^\/product\/(\d+)$/);
  if (productMatch) {
    const { products } = await loadCatalog();
    const product = products.find((x) => x.id === Number(productMatch[1]));
    if (!product) return notFoundModel(p, shopName);

    const desc =
      clip(product.description, 155) ||
      `Fresh halal ${product.name.toLowerCase()} from ${shopName}, cut to order and delivered in Gurugram${product.minPrice ? ` – from ₹${product.minPrice}` : ""}.`;
    const title = clip(`Buy ${product.name} Online in Gurugram | ${shopName}`, 66);
    const offers = product.minPrice
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: product.minPrice,
          highPrice: product.maxPrice,
          offerCount: product.variants.length,
          availability: product.isInStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          url: `${SITE_URL}${p}`,
          seller: { "@type": "Organization", name: shopName },
        }
      : undefined;
    return {
      status: 200,
      path: p,
      title,
      description: desc,
      image: product.image,
      ogType: "product",
      schema: [
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: clip(product.description, 500) || desc,
          image: product.images.length ? product.images : product.image ? [product.image] : undefined,
          category: product.categoryName,
          brand: { "@type": "Brand", name: shopName },
          offers,
        }),
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Shop", path: "/shop" },
          { name: product.name, path: p },
        ]),
      ],
      body: `
        <h1>${esc(product.name)}</h1>
        ${product.image ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" width="400" height="400">` : ""}
        <p>${esc(product.description || desc)}</p>
        <p>Category: <a href="/shop?category=${esc(product.categoryId)}">${esc(product.categoryName)}</a>. ${product.isInStock ? "Available today." : "Currently out of stock."} Fresh halal, delivered in Gurugram between ${esc(window)}.</p>
        <h2>Sizes and prices</h2>
        <ul>${product.variants.map((v) => `<li>${esc(v.label)} – ₹${esc(v.price)}${v.inStock ? "" : " (out of stock)"}</li>`).join("")}</ul>
        ${mainNav()}`,
    };
  }

  /* Recipes */
  if (p === "/recipes") {
    const recipes = await loadRecipes();
    return {
      status: 200,
      path: p,
      title: "Halal Meat Recipes – Chicken & Mutton | Meat Vanta",
      description: `Easy step-by-step chicken, mutton and kebab recipes from ${shopName}, with the exact cuts to order.`,
      schema: [breadcrumb([{ name: "Home", path: "/" }, { name: "Recipes", path: "/recipes" }])],
      body: `
        <h1>Chicken, mutton and kebab recipes</h1>
        <p>Step-by-step recipes using fresh halal meat from ${esc(shopName)}.</p>
        ${links(recipes.map((r) => ({ href: `/recipes/${r.slug}`, text: r.title, note: clip(r.intro, 100) })))}
        ${mainNav()}`,
    };
  }

  const recipeMatch = p.match(/^\/recipes\/([a-z0-9-]+)$/i);
  if (recipeMatch) {
    const r = await loadRecipe(recipeMatch[1]);
    if (!r) return notFoundModel(p, shopName);
    const desc = clip(r.intro, 155) || `How to cook ${r.title} with fresh halal meat from ${shopName}.`;
    const image = absUrl(r.images[0]?.url || r.imageUrl);
    const iso = (min) => (min ? `PT${min}M` : undefined);
    return {
      status: 200,
      path: p,
      title: clip(`${r.title} Recipe | ${shopName}`, 66),
      description: desc,
      image,
      ogType: "article",
      schema: [
        jsonLd({
          "@context": "https://schema.org",
          "@type": "Recipe",
          name: r.title,
          description: desc,
          image: image ? [image] : undefined,
          prepTime: iso(r.prepMinutes),
          cookTime: iso(r.cookMinutes),
          totalTime: iso((r.prepMinutes || 0) + (r.cookMinutes || 0)),
          recipeYield: r.serves ? `${r.serves} servings` : undefined,
          recipeIngredient: r.ingredients.map((i) => [i.quantity, i.unit, i.name].filter(Boolean).join(" ")),
          recipeInstructions: r.steps.map((s) => ({ "@type": "HowToStep", text: s.text })),
          author: { "@type": "Organization", name: shopName },
        }),
        breadcrumb([
          { name: "Home", path: "/" },
          { name: "Recipes", path: "/recipes" },
          { name: r.title, path: p },
        ]),
      ],
      body: `
        <h1>${esc(r.title)}</h1>
        <p>${esc(r.intro || desc)}</p>
        <p>${r.prepMinutes ? `Prep ${esc(r.prepMinutes)} min. ` : ""}${r.cookMinutes ? `Cook ${esc(r.cookMinutes)} min. ` : ""}${r.serves ? `Serves ${esc(r.serves)}.` : ""}</p>
        <h2>Ingredients</h2>
        <ul>${r.ingredients.map((i) => `<li>${esc([i.quantity, i.unit, i.name].filter(Boolean).join(" "))}${i.note ? ` (${esc(i.note)})` : ""}</li>`).join("")}</ul>
        <h2>Method</h2>
        <ol>${r.steps.map((s) => `<li>${esc(s.text)}</li>`).join("")}</ol>
        ${mainNav()}`,
    };
  }

  /* About */
  if (p === "/about") {
    return {
      status: 200,
      path: p,
      title: `About ${shopName} – Fresh Halal Meat Shop, Gurugram`,
      description: clip(shop.aboutStory, 155) || `${shopName} is a family-run halal meat shop in Gurugram serving fresh, daily-cut chicken and mutton.`,
      schema: [breadcrumb([{ name: "Home", path: "/" }, { name: "About", path: "/about" }])],
      body: `
        <h1>About ${esc(shopName)}</h1>
        <p>${esc(shop.aboutStory || `${shopName} is a family-run halal meat shop in Gurugram.`)}</p>
        ${shop.qualityPromise ? `<h2>Our quality promise</h2><p>${esc(shop.qualityPromise)}</p>` : ""}
        ${shop.fssaiNumber ? `<p>FSSAI Licence No. ${esc(shop.fssaiNumber)}</p>` : ""}
        ${mainNav()}`,
    };
  }

  /* Contact */
  if (p === "/contact") {
    return {
      status: 200,
      path: p,
      title: `Contact ${shopName} – Phone, WhatsApp & Address`,
      description: `Call or WhatsApp ${shopName}${shop.phone ? ` on ${shop.phone}` : ""} or visit us in Gurugram. Bulk and party orders welcome.`,
      schema: [breadcrumb([{ name: "Home", path: "/" }, { name: "Contact", path: "/contact" }])],
      body: `
        <h1>Contact ${esc(shopName)}</h1>
        <p>${esc(shop.addressLine || "")}</p>
        <p>${shop.phone ? `Phone: <a href="tel:${esc(shop.phone)}">${esc(shop.phone)}</a>. ` : ""}${shop.whatsappNumber ? `WhatsApp: ${esc(shop.whatsappNumber)}. ` : ""}${shop.shopHours ? `Hours: ${esc(shop.shopHours)}.` : ""}</p>
        ${mainNav()}`,
    };
  }

  /* FAQ */
  if (p === "/faq") {
    const faqs = buildFaqs(ctx);
    return {
      status: 200,
      path: p,
      title: `FAQs – Ordering, Delivery & Payment | ${shopName}`,
      description: `Answers about freshness, delivery timing, delivery charges, payment and halal sourcing at ${shopName}, Gurugram.`,
      schema: [
        jsonLd({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
        breadcrumb([{ name: "Home", path: "/" }, { name: "FAQs", path: "/faq" }]),
      ],
      body: `
        <h1>Frequently asked questions</h1>
        ${faqs.map((f) => `<h2>${esc(f.q)}</h2><p>${esc(f.a)}</p>`).join("")}
        ${mainNav()}`,
    };
  }

  /* Delivery */
  if (p === "/delivery") {
    return {
      status: 200,
      path: p,
      title: `Delivery Information – Gurugram | ${shopName}`,
      description: `${shopName} delivers fresh halal meat across Gurugram between ${window}. Delivery charges, areas and payment options explained.`,
      schema: [breadcrumb([{ name: "Home", path: "/" }, { name: "Delivery", path: "/delivery" }])],
      body: `
        <h1>Delivery information</h1>
        <p>${esc(delivery.deliveryAreaNote || "We deliver across Gurugram.")}</p>
        <p>Delivery window: ${esc(window)} on the date you choose at checkout.</p>
        <p>${esc(buildFaqs(ctx)[2].a)}</p>
        <p>Payment: ${delivery.codEnabled ? "cash on delivery, " : ""}online payment at checkout.</p>
        ${mainNav()}`,
    };
  }

  return notFoundModel(p, shopName);
}

function notFoundModel(p, shopName) {
  return {
    status: 404,
    path: p,
    noindex: true,
    title: `Page not found | ${shopName}`,
    description: null,
    schema: [],
    body: `<h1>Page not found</h1><p>This page does not exist.</p>${mainNav()}`,
  };
}

/* ------------------------------ HTML render ------------------------------ */

let templateCache = { mtime: 0, html: null };
function readTemplate() {
  const file = path.join(DIST_DIR, "index.html");
  const stat = fs.statSync(file); // throws if the customer app has not been built
  if (stat.mtimeMs !== templateCache.mtime) {
    templateCache = { mtime: stat.mtimeMs, html: fs.readFileSync(file, "utf8") };
  }
  return templateCache.html;
}

function stripHeadTags(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[\s\S]*?\/>\s*/i, "")
    .replace(/<meta\s+name="robots"[^>]*\/?>\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*\/?>\s*/i, "")
    .replace(/<meta\s+property="og:(title|description|url|image|type)"[\s\S]*?\/>\s*/gi, "")
    .replace(/<meta\s+name="twitter:(title|description|image)"[\s\S]*?\/>\s*/gi, "");
}

async function renderPage(rawPath) {
  const template = readTemplate();
  const m = await buildPageModel(rawPath);
  const url = `${SITE_URL}${m.path === "/" ? "/" : m.path}`;
  const image = m.image || DEFAULT_IMAGE;

  const head = [
    `<title>${esc(m.title)}</title>`,
    m.description ? `<meta name="description" content="${esc(m.description)}" />` : "",
    `<meta name="robots" content="${m.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}" />`,
    m.noindex ? "" : `<link rel="canonical" href="${esc(url)}" />`,
    `<meta property="og:type" content="${esc(m.ogType || "website")}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    m.description ? `<meta property="og:description" content="${esc(m.description)}" />` : "",
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    m.description ? `<meta name="twitter:description" content="${esc(m.description)}" />` : "",
    `<meta name="twitter:image" content="${esc(image)}" />`,
    ...m.schema,
  ]
    .filter(Boolean)
    .join("\n    ");

  let html = stripHeadTags(template).replace("</head>", `    ${head}\n  </head>`);

  // Swap the default fallback inside <div id="root"> for this page's content.
  if (m.body) {
    const start = html.indexOf('<div id="root">');
    if (start !== -1) {
      const end = html.indexOf("</div>", start);
      html = `${html.slice(0, start)}<div id="root"><article id="seo-fallback">${m.body}</article>${html.slice(end)}`;
    }
  }
  return { status: m.status, html };
}

/* --------------------------- sitemap + llms.txt -------------------------- */

function isoDate(d) {
  return (d ? new Date(d) : new Date()).toISOString().slice(0, 10);
}

async function buildSitemap() {
  const [{ products }, recipes] = await Promise.all([loadCatalog(), loadRecipes()]);
  const entries = [
    ...STATIC_PAGES.map((p) => ({ loc: p, priority: p === "/" ? "1.0" : p === "/shop" ? "0.9" : "0.6", freq: p === "/" || p === "/shop" ? "daily" : "monthly" })),
    ...products.map((x) => ({ loc: `/product/${x.id}`, lastmod: x.updatedAt, priority: "0.8", freq: "daily" })),
    ...recipes.map((r) => ({ loc: `/recipes/${r.slug}`, lastmod: r.updatedAt, priority: "0.6", freq: "monthly" })),
  ];
  const urls = entries
    .map(
      (e) =>
        `  <url><loc>${esc(SITE_URL + (e.loc === "/" ? "/" : e.loc))}</loc><lastmod>${isoDate(e.lastmod)}</lastmod><changefreq>${e.freq}</changefreq><priority>${e.priority}</priority></url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

async function buildLlmsTxt() {
  const ctx = await loadContext();
  const { shop, delivery, window } = ctx;
  const { categories, products } = await loadCatalog();
  const recipes = await loadRecipes();
  const name = shop.shopName || SITE_NAME;
  const faqs = buildFaqs(ctx);

  const lines = [
    `# ${name}`,
    "",
    `> ${name} is a family-run halal meat shop in Gurugram, Haryana, India. It sells fresh halal chicken, mutton and kebabs, cut to order every morning and delivered across Gurugram between ${window}. ${shop.yearsInBusiness ? `In business for ${shop.yearsInBusiness}+ years. ` : ""}Meat is never frozen.`,
    "",
    "## Key facts",
    `- Website: ${SITE_URL}/`,
    shop.addressLine ? `- Address: ${shop.addressLine}` : null,
    shop.phone ? `- Phone: ${shop.phone}` : null,
    shop.whatsappNumber ? `- WhatsApp: ${shop.whatsappNumber}` : null,
    shop.shopHours ? `- Shop hours: ${shop.shopHours}` : null,
    `- Delivery window: ${window}`,
    `- Delivery area: ${delivery.deliveryAreaNote || "Gurugram"}`,
    `- Payment: ${delivery.codEnabled ? "cash on delivery and " : ""}online payment`,
    "- Halal: yes, all meat is halal",
    shop.fssaiNumber ? `- FSSAI licence: ${shop.fssaiNumber}` : null,
    shop.instagramUrl ? `- Instagram: ${shop.instagramUrl}` : null,
    shop.facebookUrl ? `- Facebook: ${shop.facebookUrl}` : null,
    shop.youtubeUrl ? `- YouTube: ${shop.youtubeUrl}` : null,
    "",
    "## Main pages",
    `- [Shop](${SITE_URL}/shop): all products with prices`,
    `- [Recipes](${SITE_URL}/recipes): step-by-step recipes`,
    `- [About us](${SITE_URL}/about)`,
    `- [Delivery information](${SITE_URL}/delivery)`,
    `- [FAQs](${SITE_URL}/faq)`,
    `- [Contact](${SITE_URL}/contact)`,
    "",
    "## Products",
  ];
  for (const c of categories) {
    const items = products.filter((x) => x.categorySlug === c.slug);
    if (!items.length) continue;
    lines.push("", `### ${c.name}`);
    for (const x of items) {
      const price = x.variants.length ? x.variants.map((v) => `${v.label} ₹${v.price}`).join(", ") : "";
      lines.push(`- [${x.name}](${SITE_URL}/product/${x.id})${price ? `: ${price}` : ""}`);
    }
  }
  if (recipes.length) {
    lines.push("", "## Recipes");
    for (const r of recipes) lines.push(`- [${r.title}](${SITE_URL}/recipes/${r.slug})${r.intro ? `: ${clip(r.intro, 120)}` : ""}`);
  }
  lines.push("", "## Frequently asked questions");
  for (const f of faqs) lines.push("", `**${f.q}**`, f.a);
  lines.push("", "Prices and availability change daily; the website is the source of truth.", "");
  return lines.filter((l) => l !== null).join("\n");
}

module.exports = { renderPage, buildSitemap, buildLlmsTxt, buildPageModel };
