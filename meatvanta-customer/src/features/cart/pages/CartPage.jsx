import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../../hooks/useCart";
import { useCustomerAuth } from "../../../hooks/useCustomerAuth";
import { productImage, HERO_IMAGE } from "../../../lib/images";
import { formatRupees } from "../../../lib/format";
import BannerSlot from "../../banners/components/BannerSlot";
import CouponBox from "../../coupons/components/CouponBox";
import { useCouponPreview } from "../../coupons/useCouponPreview";

export default function CartPage() {
  const { items, updateQuantity, removeItem, totalPrice } = useCart();
  const { isAuthenticated, openLogin, customer } = useCustomerAuth();
  const navigate = useNavigate();
  // The saving shown here comes from the server; checkout checks it again.
  const coupon = useCouponPreview({ customerPhone: customer?.phone });
  const discount = coupon.preview?.discount || 0;
  // First-time customers: the welcome offer teaser (the discount itself is
  // worked out at checkout, once the payment method is chosen).
  const welcome = coupon.preview?.welcome || null;
  const welcomeKey = welcome?.methods?.[0];
  const welcomeShort = welcome && welcomeKey ? welcome.shortByMethod?.[welcomeKey] || 0 : 0;
  const welcomeSave = welcome && welcomeKey ? welcome.discountByMethod?.[welcomeKey] || 0 : 0;

  // Sign-in is asked for here rather than at "Place Order" - better to know
  // who the customer is before they fill in a whole checkout form.
  function handleProceedToCheckout() {
    if (!isAuthenticated) {
      openLogin(() => navigate("/checkout"));
      return;
    }
    navigate("/checkout");
  }

  if (items.length === 0) {
    return (
      <div className="page-x py-20 text-center">
        <span className="material-symbols-outlined text-6xl text-ink/20 mb-3">shopping_bag</span>
        <p className="text-ink font-bold text-lg mb-1">Your cart is empty</p>
        <p className="text-ink/60 text-sm mb-6">Fresh cuts are waiting for you.</p>
        <Link
          to="/shop"
          className="inline-block bg-brand text-white font-bold px-8 py-3 rounded-full hover:opacity-90 transition-opacity"
        >
          Start Shopping
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Hero banner */}
      <section className="relative overflow-hidden bg-gradient-to-r from-surface via-surface to-surface-alt border-b border-hairline">
        <div className="page-x grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 items-center py-8 md:py-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="material-symbols-outlined text-3xl text-brand">shopping_cart</span>
              <h1 className="font-display text-headline-lg text-brand">Your Cart</h1>
            </div>
            <p className="text-ink/60 text-sm max-w-md">
              Good food brings people together. Here's what you've selected from Meat Vanta.
            </p>
          </div>
          <div className="relative hidden md:block w-64 h-32 rounded-lg overflow-hidden shrink-0">
            <img src={HERO_IMAGE} alt="Fresh cuts" className="w-full h-full object-cover" />
          </div>
        </div>
      </section>

      <div className="page-x max-w-6xl mx-auto py-8 md:py-12">
      {/* Offers - nothing renders when none are live */}
      <BannerSlot placement="cart_top" inset="inside" className="mb-6" label="Offers" />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* Items */}
        <div className="space-y-3">
          {/* Column header - desktop only */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink/50">
            <span>Product</span>
            <span className="w-20 text-right">Price</span>
            <span className="w-28 text-center">Quantity</span>
            <span className="w-8" />
          </div>

          {items.map((item) => (
            <div
              key={item.lineKey}
              className="bg-white rounded border border-hairline p-3 flex items-center gap-3"
            >
              <div className="w-16 h-16 rounded-sm bg-surface flex items-center justify-center overflow-hidden shrink-0">
                <img
                  src={item.imageUrl || productImage({ id: item.productId }, 200)}
                  alt={item.productName}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-bold text-ink text-sm leading-snug truncate">{item.productName}</p>
                <p className="text-xs text-ink/60">{item.variantLabel}</p>
                {item.optionLabels?.length > 0 && (
                  <p className="text-xs text-brand-dark font-medium">{item.optionLabels.join(", ")}</p>
                )}
                {item.includes && <p className="text-xs text-ink/60 line-clamp-2">Includes: {item.includes}</p>}
                <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide bg-success/10 text-success px-2 py-0.5 rounded-full">
                  Fresh & Halal
                </span>
                <p className="text-sm font-bold text-ink mt-1">
                  ₹{item.price + (item.optionsTotal || 0)}
                  {item.optionsTotal > 0 && (
                    <span className="text-[11px] font-normal text-ink/50"> (₹{item.price} + ₹{item.optionsTotal})</span>
                  )}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center border border-ink/15 rounded-full">
                  <button
                    onClick={() => updateQuantity(item.lineKey, item.quantity - 1)}
                    className="w-8 h-8 flex items-center justify-center text-ink hover:text-brand"
                    aria-label="Decrease quantity"
                  >
                    <span className="material-symbols-outlined text-base">remove</span>
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-ink">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.lineKey, item.quantity + 1)}
                    className="w-8 h-8 flex items-center justify-center text-ink hover:text-brand"
                    aria-label="Increase quantity"
                  >
                    <span className="material-symbols-outlined text-base">add</span>
                  </button>
                </div>
                <button
                  onClick={() => removeItem(item.lineKey)}
                  aria-label="Remove item"
                  className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center hover:bg-brand hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-base">delete</span>
                </button>
              </div>
            </div>
          ))}

          <Link to="/shop" className="inline-flex items-center gap-1 mt-2 text-sm font-bold text-brand-dark">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Continue Shopping
          </Link>
        </div>

        {/* Order summary - sticky sidebar */}
        <div className="bg-white rounded border border-hairline p-5 lg:sticky lg:top-24">
          <h2 className="font-bold text-ink mb-3">Order Summary</h2>
          <div className="flex justify-between text-sm text-ink/70 mb-1.5">
            <span>Subtotal ({items.length} {items.length === 1 ? "item" : "items"})</span>
            <span className="font-semibold text-ink">₹{totalPrice.toFixed(0)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm text-success mb-1.5">
              <span>
                Coupon <span className="font-mono font-semibold">{coupon.preview.code}</span>
              </span>
              <span className="font-semibold">−₹{discount.toFixed(0)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm text-ink/70 mb-3">
            <span>Delivery Charges</span>
            {coupon.preview?.freeDelivery ? (
              <span className="font-semibold text-success">Free</span>
            ) : (
              <span className="text-ink/50">Calculated at checkout</span>
            )}
          </div>
          <div className="border-t border-hairline pt-3 flex justify-between items-center mb-4">
            <span className="font-bold text-ink">Total Amount</span>
            <span className="text-2xl font-bold text-brand">₹{(totalPrice - discount).toFixed(0)}</span>
          </div>

          {welcome && welcome.methods.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-sm border border-success/30 bg-success/5 p-3">
              <span className="material-symbols-outlined text-success text-lg">redeem</span>
              <div>
                <p className="text-xs font-bold text-success">{welcome.headline}</p>
                <p className="text-[11px] text-ink/60">
                  {welcomeShort > 0
                    ? `Add ${formatRupees(welcomeShort)} more to unlock it.`
                    : welcomeSave > 0
                      ? `You'll save ${formatRupees(welcomeSave)} - applied automatically at checkout.`
                      : "Applied automatically at checkout."}
                  {" "}If you use a coupon too, you get whichever saves more.
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleProceedToCheckout}
            className="flex items-center justify-center gap-2 w-full bg-brand-dark text-surface font-bold py-3.5 rounded-full hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-lg">lock</span>
            {isAuthenticated ? "Proceed to Checkout" : "Sign In & Checkout"}
          </button>

          <div className="mt-5 pt-4 border-t border-hairline">
            <CouponBox coupon={coupon} />
          </div>

          <div className="mt-4 flex items-start gap-2 bg-brand/5 border border-brand/15 rounded-sm p-3">
            <span className="material-symbols-outlined text-brand text-lg">shield</span>
            <div>
              <p className="text-xs font-bold text-ink">100% Fresh & Halal</p>
              <p className="text-[11px] text-ink/60">Premium quality meat, prepared with care for your family's health.</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mt-4 text-center">
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-ink/60 text-lg">lock</span>
              <span className="text-[10px] text-ink/60">Secure Checkout</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-ink/60 text-lg">local_shipping</span>
              <span className="text-[10px] text-ink/60">Fast Delivery</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="material-symbols-outlined text-ink/60 text-lg">verified</span>
              <span className="text-[10px] text-ink/60">Halal Certified</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
