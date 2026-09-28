/**
 * India Standard Time helpers.
 *
 * The database stores every timestamp in UTC, and the VPS clock runs in UTC,
 * but the shop thinks in IST (UTC+05:30, no daylight saving). Without these,
 * an order placed at 2 AM IST would be counted on the previous day, and
 * "today" would only start at 5:30 AM.
 *
 * A "date key" is an IST calendar date written as "YYYY-MM-DD".
 */
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Calendar parts of a moment, as seen on a clock in India. */
function istParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekday: shifted.getUTCDay(), // 0 = Sunday
  };
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Moment -> IST date key, e.g. 2026-09-26T20:00:00Z -> "2026-09-27". */
function toDateKey(date) {
  const p = istParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** True for a well-formed, real calendar date key ("2026-02-30" is rejected). */
function isValidDateKey(key) {
  if (typeof key !== "string" || !DATE_KEY_RE.test(key)) return false;
  const [y, m, d] = key.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** IST date key -> the UTC moment when that day starts in India (00:00 IST). */
function startOfIstDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
}

/** Adds whole days to a date key. */
function addDays(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Number of calendar days from one key to another (same day = 0). */
function daysBetween(fromKey, toKey) {
  return Math.round((startOfIstDay(toKey) - startOfIstDay(fromKey)) / DAY_MS);
}

function todayKey() {
  return toDateKey(new Date());
}

/** Weekday of a date key (0 = Sunday). */
function weekdayOf(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday that starts the week containing this date key. */
function mondayOf(key) {
  const offset = (weekdayOf(key) + 6) % 7; // Mon -> 0, Sun -> 6
  return addDays(key, -offset);
}

/** "26 Sep" / "26 Sep 2026" */
function formatDay(key, withYear = false) {
  const [y, m, d] = key.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ""}`;
}

/** "Sat, 26 Sep 2026" */
function formatDayLong(key) {
  return `${WEEKDAYS[weekdayOf(key)]}, ${formatDay(key, true)}`;
}

function formatMonth(y, m) {
  return `${MONTHS[m - 1]} ${y}`;
}

module.exports = {
  IST_OFFSET_MS,
  istParts,
  toDateKey,
  isValidDateKey,
  startOfIstDay,
  addDays,
  daysBetween,
  todayKey,
  mondayOf,
  formatDay,
  formatDayLong,
  formatMonth,
};
