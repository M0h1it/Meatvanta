const prisma = require("../../config/db");
const ist = require("../../utils/istDate.util");

/**
 * Sales analytics for the admin dashboard.
 *
 * Definitions (kept in one place so every number on the page agrees):
 *  - A SALE is a delivered order. Its date is either when it was ordered
 *    (dateBasis "order") or when it was delivered (dateBasis "delivery").
 *  - ORDERS PLACED counts every order created in the range, whatever its status.
 *  - All days, weeks and hours are India time (see istDate.util.js).
 *
 * Orders are fetched with only the fields needed and aggregated here rather
 * than in SQL. For a single shop (hundreds to a few thousand orders a month)
 * this is fast, and it keeps the IST day/week bucketing exact and testable.
 */

const GROUP_BY = ["day", "week", "month", "year"];
const DATE_BASIS = ["order", "delivery"];
const OPEN_STATUSES = ["placed", "preparing", "out_for_delivery"];
const STATUS_ORDER = ["placed", "preparing", "out_for_delivery", "delivered", "cancelled"];
const PAYMENT_LABELS = { cod: "Cash on delivery", razorpay: "Online (Razorpay)", upi: "UPI (manual)" };

const MAX_BUCKETS = 400; // e.g. a little over a year of days
const MAX_RANGE_DAYS = 3660; // ~10 years
const TOP_N = 10;
// A Razorpay checkout younger than this may still be in progress, so it is
// not counted as abandoned yet.
const ABANDONED_AFTER_MS = 30 * 60 * 1000;

function validationError(message) {
  const err = new Error(message);
  err.statusCode = 422;
  err.expose = true;
  return err;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const pctChange = (current, previous) =>
  previous === 0 ? null : round2(((current - previous) / previous) * 100);

/** "9876543210" -> "98XXXXX210". Enough to recognise a regular, not enough to copy. */
function maskPhone(phone) {
  const digits = String(phone || "");
  if (digits.length < 6) return digits;
  return `${digits.slice(0, 2)}${"X".repeat(digits.length - 5)}${digits.slice(-3)}`;
}

// ---------- Buckets ----------

function bucketKeyFor(dateKey, groupBy) {
  if (groupBy === "day") return dateKey;
  if (groupBy === "week") return ist.mondayOf(dateKey);
  if (groupBy === "month") return dateKey.slice(0, 7);
  return dateKey.slice(0, 4);
}

function bucketLabels(key, groupBy, spansYears) {
  if (groupBy === "day") {
    return { label: ist.formatDay(key, spansYears), fullLabel: ist.formatDayLong(key) };
  }
  if (groupBy === "week") {
    const end = ist.addDays(key, 6);
    return {
      label: ist.formatDay(key, spansYears),
      fullLabel: `Week of ${ist.formatDay(key, true)} – ${ist.formatDay(end, true)}`,
    };
  }
  if (groupBy === "month") {
    const [y, m] = key.split("-").map(Number);
    return { label: ist.formatMonth(y, m), fullLabel: ist.formatMonth(y, m) };
  }
  return { label: key, fullLabel: key };
}

/** Every bucket between from and to (inclusive), in order, so empty days still show as zero. */
function buildBuckets(fromKey, toKey, groupBy) {
  const spansYears = fromKey.slice(0, 4) !== toKey.slice(0, 4);
  const seen = new Set();
  const buckets = [];
  for (let key = fromKey; key <= toKey; key = ist.addDays(key, 1)) {
    const bucketKey = bucketKeyFor(key, groupBy);
    if (!seen.has(bucketKey)) {
      seen.add(bucketKey);
      buckets.push({ key: bucketKey, ...bucketLabels(bucketKey, groupBy, spansYears) });
      if (buckets.length > MAX_BUCKETS) {
        throw validationError("That range is too long to show by day. Group by week or month instead.");
      }
    }
  }
  return buckets;
}

// ---------- Queries ----------

const saleSelect = {
  id: true,
  total: true,
  discount: true,
  deliveryCharge: true,
  paymentMethod: true,
  customerId: true,
  customerName: true,
  customerPhone: true,
  createdAt: true,
  deliveredAt: true,
  updatedAt: true,
};

/** The moment a delivered order counts as sold, for the chosen date basis. */
function saleMoment(order, dateBasis) {
  if (dateBasis === "order") return order.createdAt;
  return order.deliveredAt || order.updatedAt;
}

async function loadSales(fromUtc, toUtc, dateBasis) {
  const inRange = { gte: fromUtc, lt: toUtc };
  const where =
    dateBasis === "order"
      ? { status: "delivered", createdAt: inRange }
      : {
          status: "delivered",
          // deliveredAt can be empty for an order delivered in the few seconds
          // between the migration and the new code starting - fall back to updatedAt.
          OR: [{ deliveredAt: inRange }, { deliveredAt: null, updatedAt: inRange }],
        };
  return prisma.order.findMany({ where, select: saleSelect });
}

async function loadPlaced(fromUtc, toUtc) {
  return prisma.order.findMany({
    where: { createdAt: { gte: fromUtc, lt: toUtc } },
    select: { id: true, status: true, total: true, createdAt: true },
  });
}

async function loadAbandoned(fromUtc, toUtc) {
  const cutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const upper = toUtc < cutoff ? toUtc : cutoff;
  if (upper <= fromUtc) return { count: 0, value: 0 };
  const rows = await prisma.pendingCheckout.findMany({
    where: { createdAt: { gte: fromUtc, lt: upper } },
    select: { amount: true },
  });
  return { count: rows.length, value: round2(rows.reduce((s, r) => s + Number(r.amount), 0)) };
}

/**
 * Splits the customers behind this range's sales into first-timers and
 * repeat buyers. A customer is "new" if their first non-cancelled order ever
 * falls inside the range. Identified by phone, so guest checkouts count too.
 */
async function countNewVsReturning(sales, fromUtc) {
  const phones = [...new Set(sales.map((o) => o.customerPhone).filter(Boolean))];
  if (phones.length === 0) return { newCustomers: 0, returningCustomers: 0 };

  const firsts = await prisma.order.groupBy({
    by: ["customerPhone"],
    where: { customerPhone: { in: phones }, status: { not: "cancelled" } },
    _min: { createdAt: true },
  });

  let newCustomers = 0;
  for (const row of firsts) {
    if (row._min.createdAt && row._min.createdAt >= fromUtc) newCustomers += 1;
  }
  return { newCustomers, returningCustomers: phones.length - newCustomers };
}

// ---------- KPIs ----------

async function computeKpis({ fromUtc, toUtc, dateBasis }) {
  const [sales, placed, abandoned] = await Promise.all([
    loadSales(fromUtc, toUtc, dateBasis),
    loadPlaced(fromUtc, toUtc),
    loadAbandoned(fromUtc, toUtc),
  ]);
  const customers = await countNewVsReturning(sales, fromUtc);

  const totalSales = round2(sales.reduce((s, o) => s + Number(o.total), 0));
  const deliveredOrders = sales.length;
  const cancelled = placed.filter((o) => o.status === "cancelled");
  const open = placed.filter((o) => OPEN_STATUSES.includes(o.status));

  const kpis = {
    totalSales,
    deliveredOrders,
    avgOrderValue: deliveredOrders ? round2(totalSales / deliveredOrders) : 0,
    ordersPlaced: placed.length,
    cancelledOrders: cancelled.length,
    cancelledValue: round2(cancelled.reduce((s, o) => s + Number(o.total), 0)),
    pendingOrders: open.length,
    pendingValue: round2(open.reduce((s, o) => s + Number(o.total), 0)),
    discountGiven: round2(sales.reduce((s, o) => s + Number(o.discount || 0), 0)),
    deliveryCharges: round2(sales.reduce((s, o) => s + Number(o.deliveryCharge || 0), 0)),
    newCustomers: customers.newCustomers,
    returningCustomers: customers.returningCustomers,
    abandonedCheckouts: abandoned.count,
    abandonedValue: abandoned.value,
  };

  return { kpis, sales, placed };
}

// ---------- Breakdowns ----------

function buildSeries(buckets, sales, placed, groupBy, dateBasis) {
  const byKey = new Map(buckets.map((b) => [b.key, { ...b, sales: 0, deliveredOrders: 0, ordersPlaced: 0 }]));

  for (const order of sales) {
    const bucket = byKey.get(bucketKeyFor(ist.toDateKey(saleMoment(order, dateBasis)), groupBy));
    if (bucket) {
      bucket.sales += Number(order.total);
      bucket.deliveredOrders += 1;
    }
  }
  for (const order of placed) {
    const bucket = byKey.get(bucketKeyFor(ist.toDateKey(order.createdAt), groupBy));
    if (bucket) bucket.ordersPlaced += 1;
  }

  return [...byKey.values()].map((b) => ({ ...b, sales: round2(b.sales) }));
}

function buildStatusBreakdown(placed) {
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0]));
  for (const order of placed) counts[order.status] = (counts[order.status] || 0) + 1;
  return Object.entries(counts).map(([status, count]) => ({ status, count }));
}

function buildPaymentSplit(sales) {
  const map = new Map();
  for (const order of sales) {
    const key = order.paymentMethod || "cod";
    const row = map.get(key) || { method: key, label: PAYMENT_LABELS[key] || key, sales: 0, orders: 0 };
    row.sales += Number(order.total);
    row.orders += 1;
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ ...r, sales: round2(r.sales) })).sort((a, b) => b.sales - a.sales);
}

/** Orders placed per hour of the day (IST), cancelled ones left out. */
function buildHourly(placed) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0 }));
  for (const order of placed) {
    if (order.status !== "cancelled") hours[ist.istParts(order.createdAt).hour].orders += 1;
  }
  return hours;
}

function topFromMap(map, sortKey = "revenue") {
  return [...map.values()]
    .map((r) => ({ ...r, revenue: round2(r.revenue) }))
    .sort((a, b) => b[sortKey] - a[sortKey] || b.quantity - a.quantity)
    .slice(0, TOP_N);
}

function addTo(map, key, fields) {
  const row = map.get(key) || { name: key, quantity: 0, revenue: 0 };
  row.quantity += fields.quantity;
  row.revenue += fields.revenue;
  map.set(key, row);
}

async function buildTopLists(sales) {
  const ids = sales.map((o) => o.id);
  const items = ids.length
    ? await prisma.orderItem.findMany({
        where: { orderId: { in: ids } },
        select: {
          productName: true,
          variantLabel: true,
          quantity: true,
          lineTotal: true,
          selectedOptions: true,
          productVariant: {
            select: { product: { select: { id: true, category: { select: { name: true } } } } },
          },
        },
      })
    : [];

  const products = new Map();
  const variants = new Map();
  const options = new Map();
  const categories = new Map();

  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    const revenue = Number(item.lineTotal) || 0;

    addTo(products, item.productName, { quantity, revenue });
    addTo(variants, `${item.productName} · ${item.variantLabel}`, { quantity, revenue });
    addTo(categories, item.productVariant?.product?.category?.name || "Removed products", { quantity, revenue });

    const chosen = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];
    for (const opt of chosen) {
      if (!opt || !opt.optionName) continue;
      const key = opt.groupName ? `${opt.groupName}: ${opt.optionName}` : opt.optionName;
      addTo(options, key, { quantity, revenue: Number(opt.extraPrice || 0) * quantity });
    }
  }

  const customers = new Map();
  // Oldest first, so the name kept is the one from the customer's latest order.
  const byDate = [...sales].sort((a, b) => a.createdAt - b.createdAt);
  for (const order of byDate) {
    const key = order.customerPhone || `order-${order.id}`;
    const row = customers.get(key) || { phone: maskPhone(order.customerPhone), orders: 0, spend: 0 };
    row.name = order.customerName;
    row.customerId = order.customerId || row.customerId || null;
    row.orders += 1;
    row.spend += Number(order.total);
    customers.set(key, row);
  }

  return {
    topProducts: topFromMap(products),
    topVariants: topFromMap(variants),
    // Options are ranked by how often they are picked - most add-ons are free.
    topOptions: topFromMap(options, "quantity"),
    topCategories: topFromMap(categories),
    topCustomers: [...customers.values()]
      .map((c) => ({ ...c, spend: round2(c.spend) }))
      .sort((a, b) => b.spend - a.spend || b.orders - a.orders)
      .slice(0, TOP_N),
  };
}

// ---------- Entry point ----------

/**
 * @param {object} params
 * @param {string} [params.from]      IST date key, inclusive. Omit for "all time".
 * @param {string} [params.to]        IST date key, inclusive. Defaults to today.
 * @param {string} [params.groupBy]   day | week | month | year
 * @param {string} [params.dateBasis] order | delivery
 */
async function getAnalytics({ from, to, groupBy = "day", dateBasis = "order" } = {}) {
  if (!GROUP_BY.includes(groupBy)) throw validationError("groupBy must be day, week, month or year.");
  if (!DATE_BASIS.includes(dateBasis)) throw validationError("dateBasis must be order or delivery.");

  const toKey = to || ist.todayKey();
  if (!ist.isValidDateKey(toKey)) throw validationError("'to' must be a date like 2026-09-26.");

  const isAllTime = !from;
  let fromKey = from;
  if (isAllTime) {
    const first = await prisma.order.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } });
    fromKey = first ? ist.toDateKey(first.createdAt) : toKey;
    if (fromKey > toKey) fromKey = toKey;
  }
  if (!ist.isValidDateKey(fromKey)) throw validationError("'from' must be a date like 2026-09-01.");
  if (fromKey > toKey) throw validationError("'from' must be on or before 'to'.");

  const spanDays = ist.daysBetween(fromKey, toKey) + 1;
  if (spanDays > MAX_RANGE_DAYS) throw validationError("Please choose a range of 10 years or less.");

  const buckets = buildBuckets(fromKey, toKey, groupBy);
  const fromUtc = ist.startOfIstDay(fromKey);
  const toUtc = ist.startOfIstDay(ist.addDays(toKey, 1)); // exclusive

  const current = await computeKpis({ fromUtc, toUtc, dateBasis });

  // Same-length period right before this one, for the "vs previous" deltas.
  let previous = null;
  if (!isAllTime) {
    const prevFromKey = ist.addDays(fromKey, -spanDays);
    const prev = await computeKpis({
      fromUtc: ist.startOfIstDay(prevFromKey),
      toUtc: fromUtc,
      dateBasis,
    });
    previous = {
      from: prevFromKey,
      to: ist.addDays(fromKey, -1),
      kpis: prev.kpis,
      change: Object.fromEntries(
        Object.keys(current.kpis).map((k) => [k, pctChange(current.kpis[k], prev.kpis[k])])
      ),
    };
  }

  const tops = await buildTopLists(current.sales);

  return {
    range: { from: fromKey, to: toKey, days: spanDays, groupBy, dateBasis, isAllTime },
    kpis: current.kpis,
    previous,
    series: buildSeries(buckets, current.sales, current.placed, groupBy, dateBasis),
    statusBreakdown: buildStatusBreakdown(current.placed),
    paymentSplit: buildPaymentSplit(current.sales),
    hourly: buildHourly(current.placed),
    ...tops,
  };
}

module.exports = { getAnalytics, maskPhone, GROUP_BY, DATE_BASIS };
