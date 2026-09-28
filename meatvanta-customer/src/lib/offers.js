// Price / offer helpers for product cards and pages. Display only - the
// server always prices the order itself.

/** % off for one variant, or null when it has no (higher) MRP. Rounded down. */
export function variantDiscountPct(variant) {
  const price = Number(variant?.price);
  const mrp = Number(variant?.mrp);
  if (!mrp || !price || mrp <= price) return null;
  return Math.floor(((mrp - price) / mrp) * 100);
}

/**
 * What a product card shows: the cheapest variant ("from ₹159"), that
 * variant's MRP when it has one, and the best discount across variants
 * ("20% OFF", or "Up to 25% OFF" when variants differ).
 */
export function cardPricing(product) {
  const variants = product?.variants || [];
  if (variants.length === 0) return null;
  const pool = variants.some((v) => v.isInStock) ? variants.filter((v) => v.isInStock) : variants;
  const cheapest = pool.reduce((a, b) => (Number(b.price) < Number(a.price) ? b : a));
  const pcts = pool.map(variantDiscountPct).filter((p) => p !== null);
  const best = pcts.length ? Math.max(...pcts) : null;
  const allSame = pcts.length === pool.length && pcts.every((p) => p === best);
  return {
    price: Number(cheapest.price),
    mrp: variantDiscountPct(cheapest) !== null ? Number(cheapest.mrp) : null,
    discountLabel: best ? `${allSame ? "" : "Up to "}${best}% OFF` : null,
  };
}

/** Coupons (shown on the site) that apply to this product. */
export function couponsForProduct(coupons, product) {
  if (!product) return [];
  return coupons.filter((c) => {
    if (c.type === "free_delivery") return false; // not about this item
    if (c.appliesTo === "products") return (c.productIds || []).includes(product.id);
    if (c.appliesTo === "categories") return (c.categoryIds || []).includes(product.categoryId);
    return true;
  });
}

/**
 * Combos: what the items cost bought separately vs the combo's price.
 * { value, price, saves, pct } - saves is 0 when the combo isn't cheaper.
 */
export function comboSavings(product) {
  const value = Number(product?.combo?.value || 0);
  const pricing = cardPricing(product);
  if (!value || !pricing) return null;
  const saves = Math.max(0, Math.floor(value - pricing.price));
  return { value, price: pricing.price, saves, pct: saves ? Math.floor((saves / value) * 100) : 0 };
}
