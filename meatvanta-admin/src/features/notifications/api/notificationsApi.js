import apiClient from "../../../lib/apiClient";

export async function fetchNotifications({ unreadOnly = false, limit = 20 } = {}) {
  const { data } = await apiClient.get("/notifications", { params: { unreadOnly, limit } });
  return data.data.notifications;
}

/** Lightweight - this is what gets polled every 30s for the bell badge. */
export async function fetchUnreadCount() {
  const { data } = await apiClient.get("/notifications/unread-count");
  return data.data.count;
}

export async function markNotificationRead(id) {
  const { data } = await apiClient.patch(`/notifications/${id}/read`);
  return data.data.notification;
}

export async function markAllNotificationsRead() {
  const { data } = await apiClient.post("/notifications/read-all");
  return data.data;
}

/** Unread new-order alerts with full order details (for the popup), oldest first. */
export async function fetchPendingOrderAlerts() {
  const { data } = await apiClient.get("/notifications/pending-orders");
  return data.data.alerts;
}

/** Pressing OK on the popup - marks that order's alert(s) read. */
export async function acknowledgeOrderAlert(notificationId) {
  const { data } = await apiClient.patch(`/notifications/${notificationId}/ack-order`);
  return data.data.notification;
}
