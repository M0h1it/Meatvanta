const prisma = require("../../config/db");

/**
 * Coupons.
 *
 * The customer only ever sends a CODE. Whether it applies and how much it takes
 * off is worked out here, from the cart lines priced from the database - so a
 * tampered request can't invent a discount.
 *
 * Types:
 *  - percent        value% off the eligible items, optionally capped at maxDiscount
 *  - flat           ₹value off the eligible items (never more than their total)
 *  - free_delivery  the delivery charge becomes 0
 *
 * Usage is counted in coupon_redemptions (one row per order). Per-customer
 * limits go by phone number, so guest checkouts count too. Cancelling an
 * order gives that use back (see releaseRedemption).
 */

const TYPES = ["percent", "flat", "free_delivery"];
const APPLIES_TO = ["all", "categories", "products"];
const CODE_RE = /^[A-Z0-9_-]{3,30}$/;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}
const couponError = (message) => httpError(422, message);

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const money = (n) => `₹${round2(n).toLocaleString("en-IN")}`;

function normalizeCode(code) {
  return String(code || "").trim().toUpperCase();
}

/** Last 10 digits - "+91 98765 43210" and "9876543210" are the same customer. */
function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

const idList = (value) => (Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

/** live | scheduled | expired | used_up | off - shown in the admin list. */
function statusOf(coupon, now = new Date()) {
  if (!coupon.isActive) return "off";
  if (coupon.startsAt && coupon.startsAt > now) return "scheduled";
  if (coupon.endsAt && coupon.endsAt <= now) return "expired";
  if (coupon.totalLimit !== null && coupon.totalLimit !== undefined && coupon.usedCount >= coupon.totalLimit) return "used_up";
  return "live";
}

/** Short customer-facing summary, e.g. "20% off, up to ₹150 · on orders above ₹500". */
function describe(coupon) {
  let what;
  if (coupon.type === "percent") {
    what = `${Number(coupon.value)}% off`;
    if (coupon.maxDiscount) what += `, up to ${money(coupon.maxDiscount)}`;
  } else if (coupon.type === "flat") {
    what = `${money(coupon.value)} off`;
  } else {
    what = "Free delivery";
  }
  const parts = [what];
  if (coupon.minOrderValue) parts.push(`on orders above ${money(coupon.minOrderValue)}`);
  if (coupon.firstOrderOnly) parts.push("first order only");
  return parts.join(" · ");
}

// ---------- Working out the discount ----------

/**
 * Checks a code against a priced cart and returns the discount.
 * Throws a 422 with a message written for the customer when it can't be used.
 *
 * @param {object}   args
 * @param {string}   args.code
 * @param {Array}    args.lines          [{ lineTotal, productId, categoryId }]
 * @param {number}   args.deliveryCharge charge known at checkout (0 in manual charge mode)
 * @param {string}   [args.customerPhone] needed for per-customer / first-order rules
 * @param {object}   [args.db]            prisma or a transaction client
 */
async function evaluateCoupon({ code, lines, deliveryCharge = 0, customerPhone, db = prisma, now = new Date() }) {
  const normalized = normalizeCode(code);
  if (!normalized) throw couponError("Enter a coupon code.");

  const coupon = await db.coupon.findUnique({ where: { code: normalized } });
  // Same message for "doesn't exist" and "switched off", so codes can't be probed.
  if (!coupon || !coupon.isActive) throw couponError(`"${normalized}" isn't a valid coupon code.`);

  if (coupon.startsAt && coupon.startsAt > now) throw couponError(`"${normalized}" isn't active yet.`);
  if (coupon.endsAt && coupon.endsAt <= now) throw couponError(`"${normalized}" has expired.`);
  if (coupon.totalLimit !== null && coupon.usedCount >= coupon.totalLimit) {
    throw couponError(`"${normalized}" has been fully used up.`);
  }

  const subtotal = round2(lines.reduce((s, l) => s + Number(l.lineTotal), 0));
  if (coupon.minOrderValue && subtotal < Number(coupon.minOrderValue)) {
    const short = round2(Number(coupon.minOrderValue) - subtotal);
    throw couponError(`Add ${money(short)} more to use "${normalized}" (minimum order ${money(coupon.minOrderValue)}).`);
  }

  // Which cart lines the discount can be taken from.
  let eligible = lines;
  if (coupon.appliesTo === "products") {
    const ids = new Set(idList(coupon.productIds));
    eligible = lines.filter((l) => ids.has(Number(l.productId)));
  } else if (coupon.appliesTo === "categories") {
    const ids = new Set(idList(coupon.categoryIds));
    eligible = lines.filter((l) => ids.has(Number(l.categoryId)));
  }
  const eligibleSubtotal = round2(eligible.reduce((s, l) => s + Number(l.lineTotal), 0));
  if (coupon.type !== "free_delivery" && eligibleSubtotal <= 0) {
    throw couponError(`"${normalized}" doesn't apply to the items in your cart.`);
  }

  const phone = normalizePhone(customerPhone);
  if (phone && (coupon.perCustomerLimit || coupon.firstOrderOnly)) {
    if (coupon.perCustomerLimit) {
      const used = await db.couponRedemption.count({ where: { couponId: coupon.id, customerPhone: phone } });
      if (used >= coupon.perCustomerLimit) {
        throw couponError(
          coupon.perCustomerLimit === 1
            ? `You've already used "${normalized}".`
            : `You've already used "${normalized}" ${coupon.perCustomerLimit} times.`
        );
      }
    }
    if (coupon.firstOrderOnly) {
      // Any earlier order from this number that wasn't cancelled. "contains"
      // on the last 10 digits also matches numbers saved as "+91 ..." - the
      // exact comparison afterwards rules out partial matches.
      const earlier = await db.order.findMany({
        where: { status: { not: "cancelled" }, customerPhone: { contains: phone.slice(-4) } },
        select: { customerPhone: true },
        take: 200,
      });
      if (earlier.some((o) => normalizePhone(o.customerPhone) === phone)) {
        throw couponError(`"${normalized}" is only for your first order.`);
      }
    }
  }

  let discount = 0;
  let freeDelivery = false;
  if (coupon.type === "percent") {
    discount = (eligibleSubtotal * Number(coupon.value)) / 100;
    if (coupon.maxDiscount) discount = Math.min(discount, Number(coupon.maxDiscount));
  } else if (coupon.type === "flat") {
    discount = Math.min(Number(coupon.value), eligibleSubtotal);
  } else {
    freeDelivery = true;
    discount = Number(deliveryCharge) || 0;
  }
  // Whole rupees, rounded DOWN: prices in the shop are whole rupees, and the
  // customer is never shown a saving bigger than they actually get.
  discount = Math.floor(round2(discount));

  return {
    coupon,
    code: coupon.code,
    discount,
    freeDelivery,
    summary: coupon.description || describe(coupon),
  };
}

/**
 * Records that an order used a coupon, inside the order's own transaction.
 * enforceLimit=true (cash on delivery) re-checks the total limit atomically,
 * so two customers can't both take the last use. For an already-paid online
 * order it is false - the customer paid the discounted price, so it is honoured.
 */
async function recordRedemption(tx, { couponId, orderId, customerPhone, customerId, discount, enforceLimit }) {
  if (enforceLimit) {
    const coupon = await tx.coupon.findUnique({ where: { id: couponId } });
    if (coupon && coupon.totalLimit !== null) {
      const updated = await tx.coupon.updateMany({
        where: { id: couponId, usedCount: { lt: coupon.totalLimit } },
        data: { usedCount: { increment: 1 } },
      });
      if (updated.count === 0) throw couponError(`"${coupon.code}" has just been fully used up. Remove it to continue.`);
    } else {
      await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    }
  } else {
    await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
  }

  await tx.couponRedemption.create({
    data: {
      couponId,
      orderId,
      customerPhone: normalizePhone(customerPhone),
      customerId: customerId || null,
      discount,
    },
  });
}

/** Gives a use back when an order is cancelled. Safe to call for orders without a coupon. */
async function releaseRedemption(tx, orderId) {
  const redemption = await tx.couponRedemption.findUnique({ where: { orderId } });
  if (!redemption) return;
  await tx.couponRedemption.delete({ where: { id: redemption.id } });
  await tx.coupon.updateMany({
    where: { id: redemption.couponId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

// ---------- Public ----------

/** Coupons marked "show on site" that can be used right now - for "Available offers". */
async function listPublicCoupons(now = new Date()) {
  const rows = await prisma.coupon.findMany({
    where: {
      isActive: true,
      showOnSite: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ createdAt: "desc" }],
  });
  return rows
    .filter((c) => c.totalLimit === null || c.usedCount < c.totalLimit)
    .map((c) => ({
      code: c.code,
      summary: c.description || describe(c),
      type: c.type,
      minOrderValue: c.minOrderValue !== null ? Number(c.minOrderValue) : null,
      endsAt: c.endsAt,
      // Lets the product page say "Extra 20% off with MUTTON20" on matching items.
      appliesTo: c.appliesTo,
      categoryIds: c.appliesTo === "categories" ? idList(c.categoryIds) : [],
      productIds: c.appliesTo === "products" ? idList(c.productIds) : [],
    }));
}

// ---------- Admin ----------

function parseMoney(value, field, { required = false, min = 0 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw couponError(`${field} is required.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < min) throw couponError(`${field} must be a number of at least ${min}.`);
  return round2(n);
}

function parseLimit(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw couponError(`${field} must be a whole number of 1 or more (or empty for no limit).`);
  return n;
}

function parseDate(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw couponError(`${field} is not a valid date and time.`);
  return d;
}

/** Validates the admin form and returns the DB fields. */
async function buildCouponData(body, existingId = null) {
  const code = normalizeCode(body.code);
  if (!CODE_RE.test(code)) {
    throw couponError("Code must be 3-30 letters, numbers, - or _ (no spaces), e.g. EID20.");
  }
  const clash = await prisma.coupon.findUnique({ where: { code } });
  if (clash && clash.id !== existingId) throw couponError(`The code "${code}" is already used by another coupon.`);

  const type = body.type;
  if (!TYPES.includes(type)) throw couponError("Choose the kind of discount.");

  let value = 0;
  let maxDiscount = null;
  if (type === "percent") {
    value = parseMoney(body.value, "Percentage", { required: true, min: 1 });
    if (value > 90) throw couponError("Percentage can be at most 90%.");
    maxDiscount = parseMoney(body.maxDiscount, "Maximum discount", { min: 1 });
  } else if (type === "flat") {
    value = parseMoney(body.value, "Amount off", { required: true, min: 1 });
  }

  const appliesTo = body.appliesTo || "all";
  if (!APPLIES_TO.includes(appliesTo)) throw couponError("Choose which items the coupon applies to.");
  let productIds = null;
  let categoryIds = null;
  if (appliesTo === "products") {
    productIds = idList(body.productIds);
    if (productIds.length === 0) throw couponError("Pick at least one product.");
    const found = await prisma.product.count({ where: { id: { in: productIds } } });
    if (found !== productIds.length) throw couponError("One of the chosen products no longer exists.");
  }
  if (appliesTo === "categories") {
    categoryIds = idList(body.categoryIds);
    if (categoryIds.length === 0) throw couponError("Pick at least one category.");
    const found = await prisma.category.count({ where: { id: { in: categoryIds } } });
    if (found !== categoryIds.length) throw couponError("One of the chosen categories no longer exists.");
  }
  if (type === "free_delivery" && appliesTo !== "all") {
    throw couponError("Free delivery applies to the whole order - choose \"All items\".");
  }

  const startsAt = parseDate(body.startsAt, "Start");
  const endsAt = parseDate(body.endsAt, "End");
  if (startsAt && endsAt && endsAt <= startsAt) throw couponError("The end time must be after the start time.");

  const description = body.description ? String(body.description).trim().slice(0, 200) : null;

  return {
    code,
    description: description || null,
    type,
    value,
    maxDiscount,
    minOrderValue: parseMoney(body.minOrderValue, "Minimum order", { min: 1 }),
    appliesTo,
    productIds,
    categoryIds,
    firstOrderOnly: Boolean(body.firstOrderOnly),
    perCustomerLimit: parseLimit(body.perCustomerLimit, "Uses per customer"),
    totalLimit: parseLimit(body.totalLimit, "Total uses"),
    startsAt,
    endsAt,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
    showOnSite: Boolean(body.showOnSite),
  };
}

const withMeta = (c) => ({ ...c, status: statusOf(c), summary: describe(c) });

async function listCoupons() {
  const rows = await prisma.coupon.findMany({ orderBy: [{ createdAt: "desc" }] });
  // Discount given so far, per coupon, from the redemption rows.
  const totals = await prisma.couponRedemption.groupBy({ by: ["couponId"], _sum: { discount: true } });
  const given = new Map(totals.map((t) => [t.couponId, Number(t._sum.discount || 0)]));
  return rows.map((c) => ({ ...withMeta(c), discountGiven: round2(given.get(c.id) || 0) }));
}

async function getCoupon(id) {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) throw httpError(404, "Coupon not found.");
  const redemptions = await prisma.couponRedemption.findMany({
    where: { couponId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { order: { select: { id: true, orderNumber: true, customerName: true, total: true, status: true, createdAt: true } } },
  });
  return { ...withMeta(coupon), redemptions };
}

async function createCoupon(body) {
  const data = await buildCouponData(body);
  return withMeta(await prisma.coupon.create({ data }));
}

async function updateCoupon(id, body) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Coupon not found.");
  // Partial update (e.g. the on/off switch): fill in what wasn't sent.
  const merged = {
    ...existing,
    value: Number(existing.value),
    maxDiscount: existing.maxDiscount !== null ? Number(existing.maxDiscount) : null,
    minOrderValue: existing.minOrderValue !== null ? Number(existing.minOrderValue) : null,
    ...body,
  };
  const data = await buildCouponData(merged, id);
  if (data.code !== existing.code && existing.usedCount > 0) {
    throw couponError("This coupon has already been used - its code can't be changed. Create a new coupon instead.");
  }
  return withMeta(await prisma.coupon.update({ where: { id }, data }));
}

/** Used coupons can't be deleted (orders point at them) - switch them off instead. */
async function deleteCoupon(id) {
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) throw httpError(404, "Coupon not found.");
  const used = await prisma.couponRedemption.count({ where: { couponId: id } });
  const onOrders = await prisma.order.count({ where: { couponId: id } });
  if (used > 0 || onOrders > 0) {
    throw couponError("This coupon has been used on orders, so it can't be deleted. Switch it off instead.");
  }
  await prisma.coupon.delete({ where: { id } });
  return { deletedId: id };
}

module.exports = {
  TYPES,
  normalizeCode,
  normalizePhone,
  describe,
  statusOf,
  evaluateCoupon,
  recordRedemption,
  releaseRedemption,
  listPublicCoupons,
  listCoupons,
  getCoupon,
  createCoupon,
  updateCoupon,
  deleteCoupon,
};
