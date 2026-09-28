// Where each banner can appear on the customer site. Order = order shown in the admin.
export const PLACEMENTS = [
  {
    id: "announcement",
    label: "Top announcement strip",
    where: "Thin red bar at the very top of every page. Several announcements take turns.",
    size: "Text only - up to 200 characters.",
    isText: true,
  },
  {
    id: "home_top",
    label: "Home - top slider",
    where: "First thing on the home page, above the main photo.",
    size: "Computer: 1920 × 600 px · Phone: 1080 × 1080 px",
  },
  {
    id: "home_middle",
    label: "Home - after categories",
    where: "Home page, just below \"Shop by category\".",
    size: "Computer: 1920 × 500 px · Phone: 1080 × 1080 px",
  },
  {
    id: "home_bottom",
    label: "Home - above best sellers",
    where: "Home page, just above the featured products.",
    size: "Computer: 1920 × 500 px · Phone: 1080 × 1080 px",
  },
  {
    id: "shop_top",
    label: "Shop page - top",
    where: "Shop page, above the category buttons.",
    size: "Computer: 1920 × 400 px · Phone: 1080 × 600 px",
  },
  {
    id: "product_page",
    label: "Product page",
    where: "Every product page, below the product details.",
    size: "Computer: 1920 × 400 px · Phone: 1080 × 600 px",
  },
  {
    id: "cart_top",
    label: "Cart page",
    where: "Cart page, above the items - good for \"add ₹200 more for free delivery\".",
    size: "Computer: 1920 × 300 px · Phone: 1080 × 500 px",
  },
  {
    id: "popup",
    label: "Pop-up",
    where: "Opens once per visit, a moment after the site loads. Several pop-ups show as one slider.",
    size: "Square works best: 1080 × 1080 px",
  },
];

export const PLACEMENT_BY_ID = Object.fromEntries(PLACEMENTS.map((p) => [p.id, p]));

export const STATUS_META = {
  live: { label: "Live", icon: "radio_button_checked", className: "bg-secondary-fixed text-on-secondary-fixed-variant" },
  scheduled: { label: "Scheduled", icon: "schedule", className: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  expired: { label: "Ended", icon: "event_busy", className: "bg-surface-container-high text-on-surface-variant" },
  off: { label: "Off", icon: "toggle_off", className: "bg-surface-container-high text-on-surface-variant" },
};

// ---- India-time helpers for the schedule inputs (<input type="datetime-local">) ----
const IST_MS = 330 * 60 * 1000;

/** Stored ISO time -> "2026-10-01T09:00" as it reads on a clock in India. */
export function toIstInput(iso) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + IST_MS).toISOString().slice(0, 16);
}

/** "2026-10-01T09:00" typed in India -> value the API understands. */
export function fromIstInput(value) {
  return value ? `${value}:00+05:30` : "";
}

const FMT_OPTIONS = { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
const FMT = new Intl.DateTimeFormat("en-IN", FMT_OPTIONS);
const FMT_WITH_YEAR = new Intl.DateTimeFormat("en-IN", { ...FMT_OPTIONS, year: "numeric" });
const YEAR = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" });

/** "1 Oct, 9:00 am" - with the year added when it isn't this year ("1 Jan 2030, 12:00 am"). */
export function formatIst(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const sameYear = YEAR.format(date) === YEAR.format(new Date());
  return (sameYear ? FMT : FMT_WITH_YEAR).format(date);
}

// ---- Shapes ----
export const DESKTOP_RATIOS = [
  { id: "auto", label: "Auto (picture's own shape)" },
  { id: "4:1", label: "Thin strip 4:1" },
  { id: "3:1", label: "Wide 3:1" },
  { id: "2:1", label: "Medium 2:1" },
  { id: "16:9", label: "Video 16:9" },
  { id: "1:1", label: "Square 1:1" },
];
export const MOBILE_RATIOS = [
  { id: "auto", label: "Auto (picture's own shape)" },
  { id: "2:1", label: "Wide 2:1" },
  { id: "16:9", label: "Video 16:9" },
  { id: "1:1", label: "Square 1:1" },
  { id: "4:5", label: "Tall 4:5" },
];
export const FOCUS_POINTS = [
  { id: "center", label: "Middle", icon: "filter_center_focus" },
  { id: "top", label: "Top", icon: "vertical_align_top" },
  { id: "bottom", label: "Bottom", icon: "vertical_align_bottom" },
  { id: "left", label: "Left", icon: "align_horizontal_left" },
  { id: "right", label: "Right", icon: "align_horizontal_right" },
];
export const DEFAULT_LAYOUT = { desktopRatio: "auto", mobileRatio: "auto", fullWidth: false };

/** "3:1" -> "3 / 1" for CSS aspect-ratio, null for auto. */
export function ratioToCss(ratio) {
  if (!ratio || ratio === "auto") return null;
  const [w, h] = ratio.split(":").map(Number);
  return w > 0 && h > 0 ? `${w} / ${h}` : null;
}

export function focusToObjectPosition(focus) {
  return { center: "center center", top: "center top", bottom: "center bottom", left: "left center", right: "right center" }[focus] || "center center";
}

/** Picture size to design at for a shape: 1920 wide on computers, 1080 on phones. */
export function recommendedSize(ratio, device) {
  const width = device === "phone" ? 1080 : 1920;
  if (!ratio || ratio === "auto") return null;
  const [w, h] = ratio.split(":").map(Number);
  return `${width} × ${Math.round((width * h) / w)} px`;
}
