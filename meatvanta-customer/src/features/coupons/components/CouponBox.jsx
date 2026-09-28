import { useEffect, useState } from "react";
import { fetchAvailableCoupons } from "../api/couponsApi";
import { formatRupees } from "../../../lib/format";

/**
 * Coupon entry + the shop's "Available offers". Pass the object returned by
 * useCouponPreview(). Everything shown here comes from the server.
 */
export default function CouponBox({ coupon, showOffers = true }) {
  const { couponCode, preview, isChecking, error, apply, remove } = coupon;
  const [input, setInput] = useState("");
  const [offers, setOffers] = useState([]);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!showOffers) return;
    fetchAvailableCoupons()
      .then(setOffers)
      .catch(() => setOffers([]));
  }, [showOffers]);

  async function handleApply(code) {
    const ok = await apply(code);
    if (ok) setInput("");
  }

  const visibleOffers = offers.filter((o) => o.code !== couponCode);
  const listed = showAll ? visibleOffers : visibleOffers.slice(0, 2);

  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink mb-2">
        <span className="material-symbols-outlined text-base">sell</span>
        Have a coupon?
      </p>

      {couponCode && preview && (
        <div className="flex items-start justify-between gap-2 rounded-sm border border-success/30 bg-success/5 px-3 py-2 mb-2" role="status">
          <div className="min-w-0">
            <p className="text-sm font-bold text-success font-mono tracking-wide">{preview.code} applied</p>
            <p className="text-xs text-success/80">
              {preview.freeDelivery
                ? preview.savings > 0
                  ? `Free delivery - you save ${formatRupees(preview.savings)}`
                  : "Free delivery on this order"
                : `You save ${formatRupees(preview.savings)}`}
            </p>
          </div>
          <button type="button" onClick={remove} className="text-xs font-bold text-brand underline shrink-0">
            Remove
          </button>
        </div>
      )}

      {/* Not a <form>: on the checkout page this sits inside the order form, and a
          nested form would submit (or reload) the checkout instead of applying the code. */}
      <div className="flex gap-2">
        <label htmlFor="coupon-input" className="sr-only">
          Coupon code
        </label>
        <input
          id="coupon-input"
          value={input}
          onChange={(e) => setInput(e.target.value.toUpperCase().replace(/\s/g, ""))}
          placeholder={couponCode ? "Try another code" : "Enter code"}
          maxLength={30}
          autoComplete="off"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // never let Enter submit the surrounding checkout form
              if (input) handleApply(input);
            }
          }}
          className="flex-1 min-w-0 rounded-sm border border-ink/15 px-3 py-2 text-sm font-mono tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-brand-dark"
        />
        <button
          type="button"
          onClick={() => handleApply(input)}
          disabled={isChecking || !input}
          className="px-4 rounded-sm border border-accent text-accent text-sm font-bold hover:bg-accent/10 disabled:opacity-40"
        >
          {isChecking ? "…" : "Apply"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-brand mt-1.5" role="alert">
          {error}
        </p>
      )}

      {showOffers && visibleOffers.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-ink/50 mb-1.5">Available offers</p>
          <ul className="space-y-1.5">
            {listed.map((offer) => (
              <li key={offer.code} className="flex items-center justify-between gap-2 rounded-sm border border-dashed border-accent/50 bg-accent-soft/20 px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="text-xs font-bold font-mono tracking-wide text-ink">{offer.code}</p>
                  <p className="text-[11px] text-ink/60">{offer.summary}</p>
                </div>
                <button
                  type="button"
                  disabled={isChecking}
                  onClick={() => handleApply(offer.code)}
                  className="text-xs font-bold text-brand hover:underline shrink-0 disabled:opacity-40"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>
          {visibleOffers.length > 2 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-semibold text-brand-dark underline mt-1.5">
              {showAll ? "Show fewer" : `View all ${visibleOffers.length} offers`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
