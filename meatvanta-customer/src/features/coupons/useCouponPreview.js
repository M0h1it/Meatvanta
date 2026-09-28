import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "../../hooks/useCart";
import { previewCoupon } from "./api/couponsApi";

/**
 * Keeps the applied coupon in sync with the cart.
 * - apply(code): checks a new code; only kept if the server accepts it (a
 *   rejected code leaves any coupon already applied in place).
 * - whenever the cart (or the phone number at checkout) changes, the kept code
 *   is checked again; if it no longer works it is removed and the reason shown.
 *
 * Returns { couponCode, preview, isChecking, error, apply, remove }.
 * preview = { code, summary, discount, freeDelivery, savings, ... } from the server.
 */
export function useCouponPreview({ customerPhone } = {}) {
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
        const result = await previewCoupon({ code, items, customerPhone });
        if (id !== requestId.current) return false;
        setPreview(result);
        setCouponCode(result.code);
        setError(null);
        return true;
      } catch (err) {
        if (id !== requestId.current) return false;
        setError(err.response?.data?.message || "Couldn't check that coupon. Please try again.");
        // A newly typed code that fails leaves the coupon already applied (if any)
        // as it was; a kept code that stopped working is removed.
        if (!keepOnFail) {
          setPreview(null);
          setCouponCode("");
        }
        return false;
      } finally {
        if (id === requestId.current) setIsChecking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cartKey, customerPhone, setCouponCode]
  );

  // Re-check the kept code when the cart or phone changes (small delay while typing).
  useEffect(() => {
    if (!couponCode || items.length === 0) {
      setPreview(null);
      return undefined;
    }
    const timer = setTimeout(() => check(couponCode, { keepOnFail: false }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, customerPhone]);

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
    setPreview(null);
    setError(null);
  }, [setCouponCode]);

  return { couponCode, preview, isChecking, error, apply, remove };
}
