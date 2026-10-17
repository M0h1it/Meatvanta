/** "06:00" -> "6:00 AM" */
export function formatTime(time24) {
  if (!time24) return "";
  const [hourStr, minute] = time24.split(":");
  const hour = Number(hourStr);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

export function formatWindow(startTime, endTime) {
  if (!startTime || !endTime) return "";
  return `${formatTime(startTime)} – ${formatTime(endTime)}`;
}

/** "2026-08-24" or an ISO datetime -> "Mon, 24 Aug" */
export function formatDate(value) {
  if (!value) return "";
  // Date-only strings are parsed as UTC by the Date constructor, which can shift
  // the day backwards in IST - pin it to local midnight instead.
  const date = typeof value === "string" && value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function formatRupees(amount) {
  return `₹${Number(amount).toFixed(0)}`;
}

/** ISO datetime -> "24 Aug, 8:15 AM" (the viewer's own time zone) */
export function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}
