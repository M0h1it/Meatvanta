import { comboSavings, rupees } from "../lib/combo";

/** "Alag-alag ₹898 → combo ₹749 · customer saves ₹149 (16%)" */
export default function ComboPriceCompare({ value, price, label }) {
  if (!value) return null;
  const s = comboSavings(price, value);
  return (
    <div className="rounded border border-outline-variant bg-surface-container-low px-3 py-2 text-sm">
      <p className="text-on-surface">
        Bought separately: <strong>{rupees(value)}</strong>
        {price ? (
          <>
            {" "}→ {label || "combo"}: <strong>{rupees(price)}</strong>
          </>
        ) : null}
      </p>
      {s && s.saves > 0 && (
        <p className="text-on-secondary-fixed-variant font-semibold mt-0.5">
          Customer saves {rupees(s.saves)} ({s.pct}%)
        </p>
      )}
      {s && s.saves <= 0 && (
        <p className="text-error font-semibold mt-0.5">
          ⚠ The combo costs {s.saves === 0 ? "the same as" : `${rupees(-s.saves)} more than`} buying the items separately.
        </p>
      )}
    </div>
  );
}
