import { Link } from "react-router-dom";
import { comboSavings } from "../../../lib/offers";

const rupees = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

/** "What's inside" on a combo's page, with the bought-separately comparison. */
export default function ComboContents({ product, className = "" }) {
  const combo = product.combo;
  if (!combo?.items?.length) return null;
  const s = comboSavings(product);

  return (
    <div className={`bg-white border border-hairline rounded p-4 ${className}`}>
      <h2 className="font-display text-lg font-bold text-ink mb-3">What's inside</h2>
      <ul className="divide-y divide-hairline">
        {combo.items.map((item) => (
          <li key={`${item.productId}-${item.variantLabel}`} className="flex items-center gap-3 py-2.5">
            <div className="w-12 h-12 rounded bg-surface-alt overflow-hidden shrink-0">
              {item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0">
              <Link to={`/product/${item.productId}`} className="block text-sm font-semibold text-ink hover:text-brand truncate">
                {item.productName}
              </Link>
              <p className="text-xs text-ink/60">
                {item.variantLabel}
                {item.quantity > 1 ? ` × ${item.quantity}` : ""}
              </p>
            </div>
            <p className="text-sm text-ink/50">{rupees(item.unitPrice * item.quantity)}</p>
          </li>
        ))}
      </ul>
      {s && s.saves > 0 && (
        <div className="mt-3 pt-3 border-t border-hairline text-sm">
          <p className="text-ink/70">
            Bought separately <span className="line-through">{rupees(s.value)}</span> → in this combo{" "}
            <strong className="text-ink">{rupees(s.price)}</strong>
          </p>
          <p className="font-bold text-success mt-0.5">
            You save {rupees(s.saves)} ({s.pct}%)
          </p>
        </div>
      )}
    </div>
  );
}
