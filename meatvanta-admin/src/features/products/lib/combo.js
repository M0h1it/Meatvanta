/** Helpers shared by the combo editor screens. */

export const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/** Editor rows from a product's saved comboItems (as returned by the API). */
export function rowsFromComboItems(comboItems = []) {
  return comboItems
    .filter((i) => i.variant?.product)
    .map((i) => ({
      variantId: i.variant.id,
      quantity: i.quantity,
      productId: i.variant.product.id,
      productName: i.variant.product.name,
      label: i.variant.label,
      price: Number(i.variant.price),
      imageUrl: i.variant.product.imageUrl,
      problem: !i.variant.product.isActive
        ? "deactivated"
        : !i.variant.product.isInStock || !i.variant.isInStock
        ? "not available today"
        : null,
    }));
}

/** What the items cost if bought one by one. */
export function comboValue(rows) {
  return rows.reduce((sum, r) => sum + r.price * r.quantity, 0);
}

/** { saves, pct } - negative saves = the combo costs more than buying separately. */
export function comboSavings(price, value) {
  const p = Number(price);
  if (!p || !value) return null;
  const saves = value - p;
  return { saves, pct: Math.floor((saves / value) * 100) };
}
