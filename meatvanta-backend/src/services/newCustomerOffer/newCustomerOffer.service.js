const prisma = require("../../config/db");

/**
 * "New customer" welcome offer: a percentage off the FIRST order.
 *
 * Settings live in site_settings (key below) - no migration needed:
 *   enabled        master switch
 *   percent        1-90, % off the items subtotal (not the delivery charge)
 *   maxDiscount    optional ₹ cap (null = no cap)
 *   minOrderValue  optional minimum items subtotal (null = no minimum)
 *   applyOnline    offer applies when paying online (Razorpay)
 *   applyCod       offer applies on cash on delivery
 *
 * A "new customer" is a phone number (last 10 digits) with no earlier order
 * that wasn't cancelled. The customer never sends any of this - the server
 * works it out when previewing and again when placing the order.
 */

const KEY = "new_customer_offer";
const WELCOME_CODE = "WELCOME"; // label saved on the order (couponCode)

const DEFAULTS = {
  enabled: false,
  percent: 10,
  maxDiscount: null,
  minOrderValue: null,
  applyOnline: true,
  applyCod: false,
};

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

async function getSettings() {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  return { ...DEFAULTS, ...(row?.value || {}) };
}

/** Optional ₹ amount: "" / null -> null, otherwise a positive whole number. */
function parseOptionalMoney(value, label) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1000000) throw httpError(422, `${label} must be a positive amount, or left empty.`);
  return Math.round(n);
}

async function updateSettings(body = {}) {
  const next = { ...(await getSettings()) };

  if (body.enabled !== undefined) next.enabled = Boolean(body.enabled);
  if (body.percent !== undefined) {
    const n = Number(body.percent);
    if (!Number.isFinite(n) || n < 1 || n > 90) throw httpError(422, "Discount must be between 1% and 90%.");
    next.percent = round2(n);
  }
  const maxDiscount = parseOptionalMoney(body.maxDiscount, "Maximum discount");
  if (maxDiscount !== undefined) next.maxDiscount = maxDiscount;
  const minOrderValue = parseOptionalMoney(body.minOrderValue, "Minimum order");
  if (minOrderValue !== undefined) next.minOrderValue = minOrderValue;
  if (body.applyOnline !== undefined) next.applyOnline = Boolean(body.applyOnline);
  if (body.applyCod !== undefined) next.applyCod = Boolean(body.applyCod);

  if (next.enabled && !next.applyOnline && !next.applyCod) {
    throw httpError(422, "Choose at least one payment method the offer applies to.");
  }

  await prisma.siteSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: next },
    update: { value: next },
  });
  return next;
}

/**
 * True when this phone has no earlier (non-cancelled) order. Without a phone
 * (a guest who hasn't signed in yet) we can't tell, so they are shown the offer;
 * the real check runs again when the order is placed.
 */
async function isNewCustomer(customerPhone, db = prisma) {
  const phone = normalizePhone(customerPhone);
  if (phone.length < 10) return true;
  const earlier = await db.order.findMany({
    where: { status: { not: "cancelled" }, customerPhone: { contains: phone.slice(-4) } },
    select: { customerPhone: true },
    take: 200,
  });
  return !earlier.some((o) => normalizePhone(o.customerPhone) === phone);
}

function methodKey(paymentMethod) {
  return paymentMethod === "cod" ? "applyCod" : "applyOnline";
}

function percentLabel(percent) {
  return `${Number(percent)}%`;
}

/** What the customer is told about the offer, in their words. */
function headline(settings) {
  const p = percentLabel(settings.percent);
  if (settings.applyOnline && settings.applyCod) return `Get ${p} off your first order`;
  if (settings.applyOnline) return `Pay online and get ${p} off your first order`;
  return `Pay on delivery and get ${p} off your first order`;
}

/** Discount for one payment method. Whole rupees, rounded down (like coupons). */
function discountFor(settings, subtotal, paymentMethod) {
  if (!settings[methodKey(paymentMethod)]) return { discount: 0, short: 0 };
  if (settings.minOrderValue && subtotal < settings.minOrderValue) {
    return { discount: 0, short: round2(settings.minOrderValue - subtotal) };
  }
  let discount = (subtotal * settings.percent) / 100;
  if (settings.maxDiscount) discount = Math.min(discount, settings.maxDiscount);
  discount = Math.min(Math.floor(round2(discount)), Math.floor(subtotal));
  return { discount: Math.max(discount, 0), short: 0 };
}

/**
 * Everything the cart / checkout needs about the offer for this cart:
 *  eligible        offer is on AND this customer is new
 *  headline        teaser sentence
 *  methods         ["razorpay"] / ["cod"] / both
 *  byMethod        { razorpay: {discount, short}, cod: {discount, short} }
 * Returns null when the offer is off or the customer isn't new.
 */
async function describeFor({ subtotal, customerPhone }) {
  const settings = await getSettings();
  if (!settings.enabled) return null;
  if (!(await isNewCustomer(customerPhone))) return null;

  const methods = [];
  if (settings.applyOnline) methods.push("razorpay");
  if (settings.applyCod) methods.push("cod");
  return {
    percent: settings.percent,
    maxDiscount: settings.maxDiscount,
    minOrderValue: settings.minOrderValue,
    methods,
    headline: headline(settings),
    byMethod: {
      razorpay: discountFor(settings, subtotal, "razorpay"),
      cod: discountFor(settings, subtotal, "cod"),
    },
  };
}

/** Just the discount for one payment method (0 when it doesn't apply). */
async function evaluate({ subtotal, paymentMethod, customerPhone }) {
  const info = await describeFor({ subtotal, customerPhone });
  if (!info) return { discount: 0, info: null };
  const key = paymentMethod === "cod" ? "cod" : "razorpay";
  return { discount: info.byMethod[key].discount, info };
}

module.exports = { WELCOME_CODE, getSettings, updateSettings, isNewCustomer, describeFor, evaluate };
