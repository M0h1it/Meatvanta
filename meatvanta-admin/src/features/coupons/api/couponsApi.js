import apiClient from "../../../lib/apiClient";

export async function fetchCoupons() {
  const { data } = await apiClient.get("/coupons");
  return data.data.coupons;
}

/** Includes the latest orders that used it (redemptions). */
export async function fetchCoupon(id) {
  const { data } = await apiClient.get(`/coupons/${id}`);
  return data.data.coupon;
}

export async function createCoupon(payload) {
  const { data } = await apiClient.post("/coupons", payload);
  return data.data.coupon;
}

export async function updateCoupon(id, payload) {
  const { data } = await apiClient.put(`/coupons/${id}`, payload);
  return data.data.coupon;
}

export async function deleteCoupon(id) {
  const { data } = await apiClient.delete(`/coupons/${id}`);
  return data.data;
}
