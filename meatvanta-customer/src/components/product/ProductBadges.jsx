import { TAG_CLASS } from "./tagStyles";
import DealCountdown from "./DealCountdown";
import { cardPricing, comboSavings } from "../../lib/offers";

/**
 * Labels on a product: "% OFF" (from MRP), the automatic "Bestseller", and the
 * admin's live tags. `max` limits how many show (cards stay tidy); the product
 * page shows them all. A deal tag with a countdown adds a small timer.
 */
export default function ProductBadges({ product, max = 2, size = "sm", withCountdown = false, className = "" }) {
  const pricing = cardPricing(product);
  const tags = product?.tags || [];
  const items = [];
  if (product?.combo) items.push({ key: "combo", label: "Combo", cls: TAG_CLASS.dark });
  if (pricing?.discountLabel) items.push({ key: "discount", label: pricing.discountLabel, cls: TAG_CLASS.green, big: true });
  else if (comboSavings(product)?.saves > 0) items.push({ key: "save", label: `Save ₹${comboSavings(product).saves}`, cls: TAG_CLASS.green, big: true });
  for (const t of tags) items.push({ key: `t${t.id}`, label: t.label, cls: TAG_CLASS[t.color] || TAG_CLASS.red, tag: t });
  for (const label of product?.autoTags || []) items.push({ key: `a${label}`, label, cls: TAG_CLASS.gold });

  const shown = items.slice(0, max);
  const deal = withCountdown ? tags.find((t) => t.showCountdown && t.endsAt) : null;
  if (shown.length === 0 && !deal) return null;

  const pad = size === "lg" ? "text-xs px-2.5 py-1" : "text-[10px] px-2 py-0.5";
  // The discount is the main selling point, so it is noticeably bigger.
  const bigPad = size === "lg" ? "text-sm md:text-base px-4 py-2 font-extrabold" : "text-xs md:text-[13px] px-3 py-1.5 font-extrabold";
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {shown.map((b) => (
        <span key={b.key} className={`${b.cls} ${b.big ? bigPad : `${pad} font-bold`} uppercase tracking-wide rounded-sm shadow-sm`}>
          {b.label}
        </span>
      ))}
      {deal && <DealCountdown endsAt={deal.endsAt} className={`${pad} font-semibold text-brand bg-brand-soft rounded-sm`} />}
    </div>
  );
}
