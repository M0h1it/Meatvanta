// Date and number helpers for the analytics view. All dates are India time.

const IST_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }); // -> "2026-09-26"
const DAY_MS = 24 * 60 * 60 * 1000;

export function todayKey() {
  return IST_DATE.format(new Date());
}

export function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return next.toISOString().slice(0, 10);
}

export function daysBetween(fromKey, toKey) {
  const a = Date.UTC(...fromKey.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...toKey.split("-").map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((b - a) / DAY_MS);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "26 Sep 2026" */
export function formatDateKey(key) {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

export const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "thisYear", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

/** Preset -> { from, to }. `from` is undefined for all time. */
export function rangeForPreset(id, custom = {}) {
  const today = todayKey();
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  switch (id) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const d = addDays(today, -1);
      return { from: d, to: d };
    }
    case "last7":
      return { from: addDays(today, -6), to: today };
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "thisMonth":
      return { from: monthStart, to: today };
    case "lastMonth": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case "thisYear":
      return { from: `${y}-01-01`, to: today };
    case "all":
      return { from: undefined, to: today };
    default:
      return { from: custom.from || today, to: custom.to || today };
  }
}

export const GROUP_OPTIONS = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** Sensible default grouping for a range length (in days). */
export function autoGroupBy(days) {
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  if (days <= 1100) return "month";
  return "year";
}

/** The server allows up to 400 buckets - day grouping is off beyond that. */
export function isGroupAllowed(groupBy, days) {
  if (groupBy === "day") return days <= 400;
  if (groupBy === "week") return days <= 400 * 7;
  return true;
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const INR_2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("en-IN");

export const formatINR = (n) => INR.format(Number(n) || 0);
export const formatINRExact = (n) => INR_2.format(Number(n) || 0);
export const formatNumber = (n) => NUM.format(Number(n) || 0);

/** Axis ticks: ₹950, ₹1.2K, ₹3.4L, ₹1.1Cr (Indian units). */
export function formatINRCompact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const trim = (x) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, "");
  if (abs >= 1e7) return `₹${trim(v / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(v / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(v / 1e3)}K`;
  return `₹${Math.round(v)}`;
}

/** 0 -> "12 AM", 13 -> "1 PM" */
export function formatHour(h) {
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${suffix}`;
}

export const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
