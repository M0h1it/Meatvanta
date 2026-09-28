import { CHART } from "../lib/chartTheme";
import { formatINR, formatNumber } from "../lib/analyticsFormat";

// Fixed colour per payment method, so a method keeps its colour whatever the range.
const METHOD_COLORS = { cod: CHART.primary, razorpay: CHART.secondary, upi: CHART.muted };

/** Share of delivered sales by payment method: one proportion bar plus labelled rows. */
export default function PaymentSplit({ paymentSplit }) {
  const total = paymentSplit.reduce((s, p) => s + p.sales, 0);

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">Payment methods</h2>
      <p className="text-xs text-on-surface-variant mt-0.5 mb-md">Share of delivered sales</p>

      {total === 0 ? (
        <p className="text-sm text-on-surface-variant">No delivered sales in this range.</p>
      ) : (
        <>
          <div className="flex h-3 rounded-full overflow-hidden gap-[2px] bg-white" role="img" aria-label="Sales split by payment method">
            {paymentSplit.map((p) => (
              <div
                key={p.method}
                style={{ width: `${(p.sales / total) * 100}%`, background: METHOD_COLORS[p.method] || CHART.muted }}
              />
            ))}
          </div>
          <ul className="mt-md space-y-2">
            {paymentSplit.map((p) => (
              <li key={p.method} className="flex items-center justify-between text-sm gap-3">
                <span className="flex items-center gap-2 text-on-surface">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: METHOD_COLORS[p.method] || CHART.muted }} />
                  {p.label}
                </span>
                <span className="text-right tabular-nums">
                  <span className="font-semibold text-on-surface">{formatINR(p.sales)}</span>
                  <span className="text-on-surface-variant">
                    {" "}
                    · {Math.round((p.sales / total) * 100)}% · {formatNumber(p.orders)} orders
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
