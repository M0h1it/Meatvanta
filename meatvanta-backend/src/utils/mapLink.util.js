/**
 * Google Maps link for a delivery. The customer's exact map pin wins; an order
 * without a pin (phone order, old order) falls back to searching the address text.
 * Returns null when there is nothing to point at.
 */
function buildMapUrl({ latitude, longitude, address } = {}) {
  const lat = latitude === null || latitude === undefined ? NaN : Number(latitude);
  const lng = longitude === null || longitude === undefined ? NaN : Number(longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address && String(address).trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(address).trim())}`;
  }
  return null;
}

function hasPin(order) {
  return Number.isFinite(Number(order?.deliveryLatitude ?? NaN)) && Number.isFinite(Number(order?.deliveryLongitude ?? NaN));
}

/** Map link for a whole order row. */
function orderMapUrl(order) {
  return buildMapUrl({ latitude: order.deliveryLatitude, longitude: order.deliveryLongitude, address: order.deliveryAddress });
}

module.exports = { buildMapUrl, orderMapUrl, hasPin };
