import { STATUS_LABELS, formatNumber } from "../lib/analyticsFormat";

/** Orders placed in the range, by where they are now. Labels carry the meaning, not colour. */
export default function StatusBreakdown({ statusBreakdown }) {
  const max = Math.max(1, ...statusBreakdown.map((s) => s.count));
  const total = statusBreakdown.reduce((sum, s) => sum + s.count, 0);

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">Order status</h2>
      <p className="text-xs text-on-surface-variant mt-0.5 mb-md">{formatNumber(total)} orders placed in this range</p>
      <ul className="space-y-3">
        {statusBreakdown.map((s) => (
          <li key={s.status}>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-on-surface">{STATUS_LABELS[s.status] || s.status}</span>
              <span className="tabular-nums text-on-surface font-semibold">{formatNumber(s.count)}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-container">
              <div
                className="h-2 rounded-full bg-on-surface-variant transition-[width] duration-700"
                style={{ width: `${(s.count / max) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
