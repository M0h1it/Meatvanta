// Preset tag colours - the same five on the admin and the customer site.
export const TAG_COLORS = [
  { id: "red", label: "Red", className: "bg-[#B4141F] text-white" },
  { id: "gold", label: "Gold", className: "bg-[#C8952B] text-[#1A1A1A]" },
  { id: "green", label: "Green", className: "bg-[#2F6B4F] text-white" },
  { id: "blue", label: "Blue", className: "bg-[#004985] text-white" },
  { id: "dark", label: "Dark", className: "bg-[#1A1A1A] text-white" },
];
export const TAG_COLOR_CLASS = Object.fromEntries(TAG_COLORS.map((c) => [c.id, c.className]));

// One-tap starting points in the tag editor.
export const TAG_PRESETS = [
  { label: "Bestseller", color: "gold" },
  { label: "New", color: "green" },
  { label: "Limited stock", color: "red" },
  { label: "Eid Special", color: "gold" },
  { label: "Deal of the day", color: "red", showCountdown: true },
  { label: "Chef's pick", color: "dark" },
];
