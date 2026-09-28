// Shared chart styling, taken from the admin theme (tailwind.config.js).
export const CHART = {
  primary: "#B4141F", // brand crimson - the single series colour
  secondary: "#C8952B", // brand gold - second category (payment split only)
  ink: "#1A1A1A",
  muted: "#5A4A3A",
  grid: "#EAE2D6", // one step off the card surface, hairline
  surface: "#FFFFFF",
  good: "#2F6B4F",
  bad: "#BA1A1A",
};

export const AXIS_TICK = { fill: CHART.muted, fontSize: 11 };
