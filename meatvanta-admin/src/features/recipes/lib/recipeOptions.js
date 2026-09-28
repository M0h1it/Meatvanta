export const DIFFICULTIES = [
  { id: "easy", label: "Easy" },
  { id: "medium", label: "Medium" },
  { id: "hard", label: "Hard" },
];

export const SPICE_LEVELS = [
  { id: 0, label: "Not spicy" },
  { id: 1, label: "Mild" },
  { id: 2, label: "Medium" },
  { id: 3, label: "Hot" },
];

/** Flame per step. "none" = no stove (marinating, resting, chopping). */
export const FLAMES = [
  { id: "none", label: "No flame", bars: 0 },
  { id: "low", label: "Low", bars: 1 },
  { id: "medium", label: "Medium", bars: 2 },
  { id: "high", label: "High", bars: 3 },
];

export const UNIT_SUGGESTIONS = ["g", "kg", "ml", "litre", "tsp", "tbsp", "cup", "pieces", "pinch", "inch", "cloves", "as needed"];

export function totalTime(r) {
  const t = (Number(r.prepMinutes) || 0) + (Number(r.cookMinutes) || 0);
  if (!t) return null;
  return t >= 60 ? `${Math.floor(t / 60)} hr ${t % 60 ? `${t % 60} min` : ""}`.trim() : `${t} min`;
}
