import apiClient from "../../../lib/apiClient";

/** Coupons the shop chose to show under "Available offers". */
export async function fetchAvailableCoupons() {
  const { data } = await apiClient.get("/coupons");
  return data.data.coupons || [];
}

/**
 * Asks the server what a code saves on this cart. Nothing is reserved - the
 * order checks it again when it is placed.
 */
export async function previewCoupon({ code, items, customerPhone }) {
  const { data } = await apiClient.post("/coupons/apply", {
    code,
    customerPhone: customerPhone || undefined,
    items: items.map((i) => ({ productVariantId: i.variantId, quantity: i.quantity, optionIds: i.optionIds?.length ? i.optionIds : undefined })),
  });
  return data.data.coupon;
}
