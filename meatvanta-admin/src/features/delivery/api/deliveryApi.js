import apiClient from "../../../lib/apiClient";

/** Active riders for the "assign rider" dropdown: [{ id, name, phone }] */
export async function fetchRiders() {
  const { data } = await apiClient.get("/delivery/riders");
  return data.data.riders;
}

/** The logged-in rider's own orders: { active: [...], delivered: [...] } */
export async function fetchMyOrders() {
  const { data } = await apiClient.get("/delivery/my-orders");
  return data.data;
}

export async function pickUpOrder(id) {
  const { data } = await apiClient.post(`/delivery/my-orders/${id}/pickup`);
  return data.data.order;
}

export async function deliverOrder(id) {
  const { data } = await apiClient.post(`/delivery/my-orders/${id}/delivered`);
  return data.data.order;
}

export async function reportDeliveryProblem(id, reason) {
  const { data } = await apiClient.post(`/delivery/my-orders/${id}/failed`, { reason });
  return data.data.order;
}

/** Cash the logged-in rider has collected and not yet handed to the shop: { amount, count } */
export async function fetchMyCash() {
  const { data } = await apiClient.get("/delivery/my-cash");
  return data.data;
}

/** Owner: cash each rider is holding. { riders, totalHeld, recentlySettled } */
export async function fetchRiderCash() {
  const { data } = await apiClient.get("/delivery/cash");
  return data.data;
}

/** Owner got the cash from the rider. orderIds optional = only those orders. */
export async function settleRiderCash(riderId, orderIds) {
  const { data } = await apiClient.post("/delivery/cash/settle", { riderId, orderIds });
  return data.data; // { settledCount, amount }
}

/** Failed delivery: send again. riderId omitted = same rider. */
export async function retryDelivery(orderId, riderId) {
  const { data } = await apiClient.post(`/delivery/orders/${orderId}/retry`, { riderId });
  return data.data.order;
}

/** Failed delivery: give up and cancel. Returns { order, refundNeeded }. */
export async function cancelFailedDelivery(orderId) {
  const { data } = await apiClient.post(`/delivery/orders/${orderId}/cancel-failed`);
  return data.data;
}
