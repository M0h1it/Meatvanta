import apiClient from "../../../lib/apiClient";

export async function fetchOrders({
  status, search, page = 1, pageSize = 25, riderId, paymentMethod, paymentStatus, from, to,
} = {}) {
  const { data } = await apiClient.get("/orders", {
    params: { status, search, page, pageSize, riderId, paymentMethod, paymentStatus, from, to },
  });
  return data.data; // { orders, total, page, pageSize, totalPages }
}

export async function fetchOrder(id) {
  const { data } = await apiClient.get(`/orders/${id}`);
  return data.data.order;
}

export async function createOrder(payload) {
  const { data } = await apiClient.post("/orders", payload);
  return data.data.order;
}

export async function updateOrderStatus(id, status) {
  const { data } = await apiClient.patch(`/orders/${id}/status`, { status });
  return data.data.order;
}

export async function cancelOrder(id) {
  const { data } = await apiClient.post(`/orders/${id}/cancel`);
  return data.data.order;
}

/**
 * An item ran out after the order was placed. `items` = [{ itemId, availableQuantity }].
 * Paid orders: the difference is credited to the customer's wallet. COD: the total drops.
 * Returns { order, walletCredited, cancelled } and the server message to show.
 */
export async function markItemsUnavailable(id, items) {
  const { data } = await apiClient.post(`/orders/${id}/unavailable`, { items });
  return { ...data.data, message: data.message };
}

export async function verifyPayment(id, paymentStatus, paymentNote) {
  const { data } = await apiClient.patch(`/orders/${id}/payment`, { paymentStatus, paymentNote });
  return data.data.order;
}

export async function setDeliveryCharge(id, deliveryCharge) {
  const { data } = await apiClient.patch(`/orders/${id}/delivery-charge`, { deliveryCharge });
  return data.data.order;
}

export async function assignDeliveryPerson(id, deliveryPersonName) {
  const { data } = await apiClient.patch(`/orders/${id}/delivery-person`, { deliveryPersonName });
  return data.data.order;
}

/** Assign a rider account (deliveryAdminId = null removes the rider). */
export async function assignRider(id, deliveryAdminId) {
  const { data } = await apiClient.patch(`/orders/${id}/delivery-person`, { deliveryAdminId });
  return data.data.order;
}

export async function fetchDashboardStats() {
  const { data } = await apiClient.get("/orders/stats/summary");
  return data.data; // { todayOrdersCount, pendingCount, todayRevenue, lowStockCount }
}
