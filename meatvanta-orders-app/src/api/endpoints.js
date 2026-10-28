import client from './client';

// Thin wrappers over the backend's /api/app routes. Each returns just the useful part of the reply.

export async function login({ email, password, deviceName, fcmToken }) {
  const { data } = await client.post('/auth/login', { email, password, deviceName, fcmToken });
  return data.data; // { token, user }
}

export async function logout() {
  await client.post('/auth/logout');
}

export async function me() {
  const { data } = await client.get('/auth/me');
  return data.data.user;
}

export async function putFcmToken(fcmToken) {
  await client.put('/devices/fcm-token', { fcmToken });
}

/** tab: 'new' (nobody has tapped "Seen it" yet) or 'active' (still in progress) */
export async function listOrders(tab) {
  const { data } = await client.get('/orders', { params: { tab } });
  return data.data.orders;
}

export async function getOrder(id) {
  const { data } = await client.get(`/orders/${id}`);
  return data.data.order;
}

export async function acknowledge(id) {
  const { data } = await client.post(`/orders/${id}/acknowledge`);
  return data.data.order;
}

export async function setStatus(id, status) {
  const { data } = await client.patch(`/orders/${id}/status`, { status });
  return data.data.order;
}

// ---- rider side (accounts that only deliver): their own assigned orders, nothing else ----

/** { active: [...], delivered: [...] } - the rider's orders, closest deadline first. */
export async function riderOrders() {
  const { data } = await client.get('/rider/orders');
  return data.data;
}

/** Cash the rider is carrying: { amount, count }. */
export async function riderCash() {
  const { data } = await client.get('/rider/cash');
  return data.data;
}

export async function riderPickup(id) {
  const { data } = await client.post(`/rider/orders/${id}/pickup`);
  return data.data.order;
}

export async function riderDelivered(id) {
  const { data } = await client.post(`/rider/orders/${id}/delivered`);
  return data.data.order;
}

export async function riderFailed(id, reason) {
  const { data } = await client.post(`/rider/orders/${id}/failed`, { reason });
  return data.data.order;
}
