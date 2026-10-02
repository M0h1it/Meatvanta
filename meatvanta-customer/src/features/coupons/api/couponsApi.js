import apiClient from "../../../lib/apiClient";

/** Coupons the shop chose to show under "Available offers". */
export async function fetchAvailableCoupons() {
  const { data } = await apiClient.get("/coupons");
  return data.data.coupons || [];
}

/**
 * Asks the server what this cart costs: the optional coupon code and, for a
 * first-time customer, the welcome offer (the bigger saving wins). Nothing is
 * reserved - the order checks it all again when it is placed.
 */
export async function previewCoupon({ code, items, customerPhone, paymentMethod }) {
  const { data } = await apiClient.post("/checkout/preview", {
    code: code || undefined,
    paymentMethod: paymentMethod || undefined,
    customerPhone: customerPhone || undefined,
    items: items.map((i) => ({ productVariantId: i.variantId, quantity: i.quantity, optionIds: i.optionIds?.length ? i.optionIds : undefined })),
  });
  return data.data.preview;
}
