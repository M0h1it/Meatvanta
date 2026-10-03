import { useEffect } from "react";

const SITE_NAME = "Meat Vanta";
const DEFAULT_TITLE = "Fresh Halal Meat Delivery in Gurugram | Meat Vanta";
const DEFAULT_DESCRIPTION =
  "Order fresh halal chicken, mutton and kebabs online. Cut every morning and delivered across Gurugram, 6 AM to 11 AM. 35+ years of trust.";
const BASE_URL = "https://meatvanta.com";

function setMetaByName(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setMetaByProperty(property, content) {
  let tag = document.querySelector(`meta[property="${property}"]`);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
}

function setCanonical(href) {
  let tag = document.querySelector('link[rel="canonical"]');
  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }
  tag.setAttribute("href", href);
}

/**
 * Sets this page's <title>, meta description, canonical URL and Open
 * Graph/Twitter tags, then restores the site defaults on unmount so the
 * next page doesn't inherit them. There's no react-helmet in this project
 * - this is a small direct-DOM equivalent, since every page here is a
 * plain client-rendered route (no SSR, so no head-mismatch risk).
 *
 * @param {Object} opts
 * @param {string} [opts.title] - page title; SITE_NAME is appended automatically unless already present
 * @param {string} [opts.description] - meta description, ideally 120-160 chars
 * @param {string} [opts.path] - route path (e.g. "/shop") used to build the canonical + og:url
 * @param {string} [opts.image] - absolute image URL for og:image/twitter:image
 */
export function useDocumentMeta({ title, description, path, image } = {}) {
  useEffect(() => {
    const fullTitle = title
      ? title.includes(SITE_NAME)
        ? title
        : `${title} | ${SITE_NAME}`
      : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESCRIPTION;
    const url = path ? `${BASE_URL}${path}` : BASE_URL;
    const ogImage = image || `${BASE_URL}/og-image.webp`;

    document.title = fullTitle;
    setMetaByName("description", desc);
    setCanonical(url);

    setMetaByProperty("og:title", fullTitle);
    setMetaByProperty("og:description", desc);
    setMetaByProperty("og:url", url);
    setMetaByProperty("og:image", ogImage);

    setMetaByName("twitter:title", fullTitle);
    setMetaByName("twitter:description", desc);
    setMetaByName("twitter:image", ogImage);

    // Restore the index.html defaults when this page unmounts, so a page
    // that sets nothing doesn't quietly keep the last visited page's title.
    return () => {
      document.title = DEFAULT_TITLE;
      setMetaByName("description", DEFAULT_DESCRIPTION);
      setCanonical(BASE_URL);
      setMetaByProperty("og:title", DEFAULT_TITLE);
      setMetaByProperty("og:description", DEFAULT_DESCRIPTION);
      setMetaByProperty("og:url", BASE_URL);
      setMetaByProperty("og:image", `${BASE_URL}/og-image.webp`);
      setMetaByName("twitter:title", DEFAULT_TITLE);
      setMetaByName("twitter:description", DEFAULT_DESCRIPTION);
      setMetaByName("twitter:image", `${BASE_URL}/og-image.webp`);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, path, image]);
}
