import { Link } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import { productImage } from "../../lib/images";
import { formatRupees } from "../../lib/format";

/**
 * Slim cart column on the right edge of laptop screens (like Amazon's):
 * subtotal, "Go to Cart", and each item's photo with a little +/- stepper.
 * Hidden on phones/tablets and while the cart is empty.
 */
export default function SideCart() {
  const { items, totalPrice, updateQuantity } = useCart();
  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Your cart"
      className="hidden lg:flex flex-col fixed right-0 top-[8.25rem] z-30 w-28 max-h-[calc(100vh-9.5rem)] bg-white border border-r-0 border-hairline rounded-l-lg shadow-md"
    >
      <div className="p-2.5 text-center border-b border-hairline">
        <p className="text-[11px] text-ink/60">Subtotal</p>
        <p className="font-display font-bold text-brand text-base leading-tight">{formatRupees(totalPrice)}</p>
        <Link
          to="/cart"
          className="block mt-2 text-[11px] font-bold border border-ink/20 rounded-full py-1 hover:border-brand hover:text-brand transition-colors"
        >
          Go to Cart
        </Link>
      </div>

      <ul className="flex-1 overflow-y-auto p-2 space-y-3 [scrollbar-width:thin]">
        {items.map((item) => (
          <li key={item.lineKey} className="flex flex-col items-center">
            <Link to="/cart" className="relative block w-14 h-14 rounded overflow-hidden border border-hairline">
              <img
                src={item.imageUrl || productImage({ id: item.productId }, 200)}
                alt={item.productName}
                className="w-full h-full object-cover"
              />
            </Link>
            <p className="text-[10px] text-ink/60 mt-1 line-clamp-1 w-full text-center">{item.variantLabel}</p>
            <div className="flex items-center border border-ink/15 rounded-full mt-0.5">
              <button
                type="button"
                onClick={() => updateQuantity(item.lineKey, item.quantity - 1)}
                aria-label="Decrease quantity"
                className="w-6 h-6 flex items-center justify-center text-ink hover:text-brand"
              >
                <span className="material-symbols-outlined text-sm">{item.quantity === 1 ? "delete" : "remove"}</span>
              </button>
              <span className="w-4 text-center text-xs font-bold text-ink">{item.quantity}</span>
              <button
                type="button"
                onClick={() => updateQuantity(item.lineKey, item.quantity + 1)}
                aria-label="Increase quantity"
                className="w-6 h-6 flex items-center justify-center text-ink hover:text-brand"
              >
                <span className="material-symbols-outlined text-sm">add</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
