import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../../hooks/useCart";
import { previewCoupon } from "./api/couponsApi";

/**
 * Keeps the server's price preview in sync with the cart.
 * - apply(code): checks a new code; only kept if the server accepts it (a
 *   rejected code leaves any coupon already applied in place).
 * - whenever the cart, the phone number or the payment method changes, the
 *   preview is fetched again (with the kept code, if any); a kept code that no
 *   longer works is removed and the reason shown.
 * - The preview also carries the new-customer welcome offer. Only ONE saving
 *   applies: `preview.kind` is "coupon", "welcome" or null.
 *
 * Returns { couponCode, preview, isChecking, error, apply, remove }.
 * couponCode = what the customer typed (kept even while the welcome offer is
 * the bigger saving, so it applies again if they switch payment method).
 * preview = { kind, code, summary, discount, freeDelivery, savings, welcome, ... }.
 */
export function useCouponPreview({ customerPhone, paymentMethod } = {}) {
  const { items, couponCode, setCouponCode } = useCart();
  const [preview, setPreview] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  // Cart contents as a string, so the effect re-runs only when they really change.
  const cartKey = items.map((i) => `${i.variantId}x${i.quantity}:${(i.optionIds || []).join("-")}`).join("|");

  const check = useCallback(
    async (code, { keepOnFail }) => {
      const id = ++requestId.current;
      setIsChecking(true);
      try {
        const result = await previewCoupon({ code, items, customerPhone, paymentMethod });
        if (id !== requestId.current) return false;
        setPreview(result);
        if (code) setCouponCode(code); // the typed code, even if the welcome offer won
        setError(null);
        return true;
      } catch (err) {
        if (id !== requestId.current) return false;
        setError(err.response?.data?.message || "Couldn't check that coupon. Please try again.");
        // A newly typed code that fails leaves the coupon already applied (if any)
        // as it was; a kept code that stopped working is removed.
        if (!keepOnFail) {
          setCouponCode("");
          // Show the price without the dead code (the welcome offer may still apply).
          try {
            const plain = await previewCoupon({ code: undefined, items, customerPhone, paymentMethod });
            if (id === requestId.current) setPreview(plain);
          } catch {
            if (id === requestId.current) setPreview(null);
          }
        }
        return false;
      } finally {
        if (id === requestId.current) setIsChecking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey, customerPhone, paymentMethod, setCouponCode]
  );

  // Fetch again when the cart, phone or payment method changes (small delay while typing).
  useEffect(() => {
    if (items.length === 0) {
      setPreview(null);
      return undefined;
    }
    const timer = setTimeout(() => check(couponCode || undefined, { keepOnFail: false }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, customerPhone, paymentMethod]);

  const apply = useCallback(
    (code) => {
      const trimmed = String(code || "").trim().toUpperCase();
      if (!trimmed) {
        setError("Enter a coupon code.");
        return Promise.resolve(false);
      }
      return check(trimmed, { keepOnFail: true });
    },
    [check]
  );

  const remove = useCallback(() => {
    requestId.current += 1;
    setCouponCode("");
    setError(null);
    // Price again without the code - the welcome offer may still apply.
    if (items.length > 0) check(undefined, { keepOnFail: true });
    else setPreview(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCouponCode, check]);

  return { couponCode, preview, isChecking, error, apply, remove };
}
