/** Small shared bits for recipe cards and the recipe page. */

export const DIFFICULTY_LABEL = { easy: "Easy", medium: "Medium", hard: "Hard" };
export const SPICE_LABEL = ["Not spicy", "Mild", "Medium spicy", "Hot"];
export const FLAME = {
  none: { label: "No flame", bars: 0 },
  low: { label: "Low flame", bars: 1 },
  medium: { label: "Medium flame", bars: 2 },
  high: { label: "High flame", bars: 3 },
};

export function formatMinutes(total) {
  if (!total) return null;
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Three chillies, `level` of them red. */
export function SpiceMeter({ level = 0, className = "" }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} role="img" aria-label={SPICE_LABEL[level] || "Spice"}>
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 16 16" width="13" height="13" className={n <= level ? "text-brand" : "text-ink/20"} aria-hidden="true">
          <path fill="currentColor" d="M11.5 1c.3 1-.2 1.8-.9 2.3 1.6.4 2.6 1.7 2.4 3.4-.4 3.6-4.6 7.6-10.5 8.3-.9.1-1.2-1-.4-1.4C6 11.8 8.2 9.4 8.8 6.2c.2-1.2 1-2.3 2.3-2.9-.2-.8.1-1.7.4-2.3z" />
        </svg>
      ))}
    </span>
  );
}

/** Flame drawing for a step: `bars` of three flames lit. */
export function FlameIcon({ bars = 0, className = "" }) {
  return (
    <span className={`inline-flex items-end gap-px ${className}`} aria-hidden="true">
      {[1, 2, 3].map((n) => (
        <svg key={n} viewBox="0 0 12 16" width={7 + n * 2} height={9 + n * 3} className={n <= bars ? "text-brand" : "text-ink/15"}>
          <path fill="currentColor" d="M6 0c1 3 5 5 5 9.5A5 5 0 0 1 1 9.5C1 7 3 6 3 3.5 4.5 5 5 6 5 7.5 6.5 6 6.5 3 6 0z" />
        </svg>
      ))}
    </span>
  );
}
