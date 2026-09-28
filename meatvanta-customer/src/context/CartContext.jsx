import { createContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "meat-vanta-cart";
const COUPON_KEY = "meat-vanta-coupon";

function loadCoupon() {
  try {
    return localStorage.getItem(COUPON_KEY) || "";
  } catch {
    return "";
  }
}

export const CartContext = createContext(null);

function loadInitialCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return []; // corrupted storage shouldn't crash the app - just start empty
  }
}

/**
 * A line is identified by the variant AND the chosen options - the same cut
 * with Tandoori marination is a different line from the same cut with Handi,
 * so they can't collapse into one row.
 */
function buildLineKey(variantId, optionIds) {
  const sorted = [...(optionIds || [])].sort((a, b) => a - b);
  return sorted.length ? `${variantId}:${sorted.join("-")}` : `${variantId}`;
}

/**
 * Guest-friendly cart - lives entirely client-side (localStorage), no backend
 * cart table. Prices here are for display only; the server recomputes every
 * line from the database at order time.
 */
export function CartProvider({ children }) {
  const [items, setItems] = useState(loadInitialCart);
  // Only the CODE is kept here. Whether it works and what it saves is always
  // asked from the server (see useCouponPreview) - never worked out in the browser.
  const [couponCode, setCouponCode] = useState(loadCoupon);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    try {
      if (couponCode) localStorage.setItem(COUPON_KEY, couponCode);
      else localStorage.removeItem(COUPON_KEY);
    } catch {
      /* storage blocked - the code just won't survive a reload */
    }
  }, [couponCode]);

  const addItem = useCallback((product, variant, quantity, selectedOptions = []) => {
    const optionIds = selectedOptions.map((o) => o.id);
    const lineKey = buildLineKey(variant.id, optionIds);
    const optionsTotal = selectedOptions.reduce((sum, o) => sum + Number(o.extraPrice), 0);

    setItems((current) => {
      const existing = current.find((i) => i.lineKey === lineKey);
      if (existing) {
        return current.map((i) =>
          i.lineKey === lineKey ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [
        ...current,
        {
          lineKey,
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          imageUrl: product.imageUrl,
          variantLabel: variant.label,
          price: Number(variant.price),
          optionIds,
          optionsTotal,
          optionLabels: selectedOptions.map((o) => o.name),
          // Combos: "Chicken Curry Cut 1 KG + Mutton Keema 500 GM x2"
          includes: product.combo?.items?.length
            ? product.combo.items.map((c) => `${c.productName} ${c.variantLabel}${c.quantity > 1 ? ` ×${c.quantity}` : ""}`).join(" + ")
            : undefined,
          quantity,
        },
      ];
    });
  }, []);

  const updateQuantity = useCallback((lineKey, quantity) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => i.lineKey !== lineKey)
        : current.map((i) => (i.lineKey === lineKey ? { ...i, quantity } : i))
    );
  }, []);

  const removeItem = useCallback((lineKey) => {
    setItems((current) => current.filter((i) => i.lineKey !== lineKey));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setCouponCode("");
  }, []);

  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = items.reduce(
    (sum, i) => sum + (i.price + (i.optionsTotal || 0)) * i.quantity,
    0
  );

  const value = {
    items,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    totalCount,
    totalPrice,
    couponCode,
    setCouponCode,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
