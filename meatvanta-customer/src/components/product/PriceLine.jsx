import { cardPricing } from "../../lib/offers";

/** "from ₹159 ₹199" on product cards - MRP struck through when there is one. */
export default function PriceLine({ product, className = "" }) {
  const pricing = cardPricing(product);
  if (!pricing) return null;
  return (
    <p className={`text-sm text-ink/70 ${className}`}>
      from <span className="font-bold text-ink">₹{pricing.price}</span>
      {pricing.mrp && (
        <span className="ml-1.5 text-ink/40 line-through" aria-label={`MRP ₹${pricing.mrp}`}>
          ₹{pricing.mrp}
        </span>
      )}
    </p>
  );
}
