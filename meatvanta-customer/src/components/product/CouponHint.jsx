import { useEffect, useState } from "react";
import { fetchAvailableCoupons } from "../../features/coupons/api/couponsApi";
import { couponsForProduct } from "../../lib/offers";
import { useCart } from "../../hooks/useCart";

/**
 * "Extra 20% off with MUTTON20" on the product page - only for coupons the
 * shop chose to show on the site. "Use code" keeps it for the cart, where the
 * server checks it against the whole order.
 */
export default function CouponHint({ product, className = "" }) {
  const { couponCode, setCouponCode } = useCart();
  const [coupons, setCoupons] = useState([]);

  useEffect(() => {
    fetchAvailableCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]));
  }, []);

  const matching = couponsForProduct(coupons, product).slice(0, 2);
  if (matching.length === 0) return null;

  return (
    <ul className={`space-y-1.5 ${className}`}>
      {matching.map((c) => {
        const isApplied = couponCode === c.code;
        return (
          <li key={c.code} className="flex items-center justify-between gap-3 rounded-sm border border-dashed border-accent/60 bg-accent-soft/20 px-3 py-2">
            <p className="text-sm text-ink min-w-0">
              <span className="material-symbols-outlined text-base text-accent align-[-3px] mr-1" aria-hidden="true">
                sell
              </span>
              {c.summary} with <span className="font-mono font-bold tracking-wide">{c.code}</span>
            </p>
            <button
              type="button"
              onClick={() => setCouponCode(c.code)}
              disabled={isApplied}
              className="text-xs font-bold text-brand shrink-0 hover:underline disabled:text-success disabled:no-underline"
            >
              {isApplied ? "Added ✓" : "Use code"}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
