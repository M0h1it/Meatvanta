const express = require("express");
const seo = require("../../services/seo/seo.service");

const router = express.Router();

// Nginx forwards customer page URLs here (see nginx-meatvanta.conf):
//   /_seo/page?path=/product/12  ->  index.html with that page's SEO tags + text.
router.get("/page", async (req, res) => {
  try {
    const { status, html } = await seo.renderPage(String(req.query.path || "/"));
    res
      .status(status)
      .set("Content-Type", "text/html; charset=utf-8")
      // Short cache: Cloudflare/browsers reuse it, price changes still show up quickly.
      .set("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=600")
      .send(html);
  } catch (err) {
    // 503 makes Nginx fall back to the plain index.html, so the site never goes down over SEO.
    console.error("[seo] page render failed:", err.message);
    res.status(503).type("text/plain").send("SEO render unavailable");
  }
});

router.get("/sitemap.xml", async (req, res) => {
  try {
    res.type("application/xml; charset=utf-8").set("Cache-Control", "public, max-age=3600").send(await seo.buildSitemap());
  } catch (err) {
    console.error("[seo] sitemap failed:", err.message);
    res.status(503).type("text/plain").send("Sitemap unavailable");
  }
});

router.get("/llms.txt", async (req, res) => {
  try {
    res.type("text/plain; charset=utf-8").set("Cache-Control", "public, max-age=3600").send(await seo.buildLlmsTxt());
  } catch (err) {
    console.error("[seo] llms.txt failed:", err.message);
    res.status(503).type("text/plain").send("llms.txt unavailable");
  }
});

module.exports = router;
