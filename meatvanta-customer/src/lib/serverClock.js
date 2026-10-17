/**
 * The shop server's clock, as seen from this browser.
 *
 * Offers (banners, deal tags, coupons) end at an exact time set by the shop. A visitor's phone
 * clock can be minutes off, so "has this ended?" is answered with the server's time:
 * every API response carries `serverTime`, and the difference to this device's clock is kept here.
 */
let offsetMs = 0;

/** Called with the `serverTime` of any API response. */
export function noteServerTime(iso) {
  const server = Date.parse(iso);
  if (Number.isFinite(server)) offsetMs = server - Date.now();
}

/** "Now" according to the shop's server (ms since epoch). */
export function serverNow() {
  return Date.now() + offsetMs;
}
