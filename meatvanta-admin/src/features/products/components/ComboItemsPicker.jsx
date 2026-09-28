import { useMemo, useState } from "react";
import { rupees } from "../lib/combo";

/**
 * Pick what goes inside a combo from the products that already exist.
 * rows: [{ variantId, quantity, productId, productName, label, price, imageUrl, problem? }]
 */
export default function ComboItemsPicker({ rows, onChange, products, excludeProductId, disabled }) {
  const [productId, setProductId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState(1);

  // Only real products can go inside (no combos, not the combo itself).
  const choices = useMemo(
    () => products.filter((p) => !p.isCombo && p.id !== excludeProductId && p.isActive !== false && p.variants?.length),
    [products, excludeProductId]
  );
  const chosenProduct = choices.find((p) => p.id === Number(productId));

  function add() {
    const variant = chosenProduct?.variants.find((v) => v.id === Number(variantId));
    if (!variant) return;
    const existing = rows.find((r) => r.variantId === variant.id);
    if (existing) {
      onChange(rows.map((r) => (r.variantId === variant.id ? { ...r, quantity: Math.min(20, r.quantity + Number(quantity)) } : r)));
    } else {
      onChange([
        ...rows,
        {
          variantId: variant.id,
          quantity: Number(quantity),
          productId: chosenProduct.id,
          productName: chosenProduct.name,
          label: variant.label,
          price: Number(variant.price),
          imageUrl: chosenProduct.imageUrl,
        },
      ]);
    }
    setProductId("");
    setVariantId("");
    setQuantity(1);
  }

  function setQty(index, next) {
    const q = Math.max(1, Math.min(20, next));
    onChange(rows.map((r, i) => (i === index ? { ...r, quantity: q } : r)));
  }

  function move(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  const select = "rounded border border-outline-variant px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <div>
      {rows.length === 0 ? (
        <p className="text-sm text-outline mb-3">Nothing inside yet - add items below.</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant mb-3">
          {rows.map((row, index) => (
            <li key={row.variantId} className="flex items-center gap-3 px-3 py-2">
              <div className="w-10 h-10 rounded bg-surface-container-low overflow-hidden shrink-0">
                {row.imageUrl && <img src={row.imageUrl} alt="" className="w-full h-full object-cover" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-on-surface truncate">
                  {row.productName} <span className="text-on-surface-variant">· {row.label}</span>
                </p>
                <p className="text-xs text-on-surface-variant">
                  {rupees(row.price)} each
                  {row.problem && <span className="ml-2 text-error font-semibold">⚠ {row.problem}</span>}
                </p>
              </div>
              {!disabled && (
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Move up" onClick={() => move(index, -1)} disabled={index === 0} className="w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">
                    ↑
                  </button>
                  <button type="button" aria-label="Move down" onClick={() => move(index, 1)} disabled={index === rows.length - 1} className="w-7 h-7 rounded text-on-surface-variant hover:bg-surface-container-low disabled:opacity-30">
                    ↓
                  </button>
                </div>
              )}
              <div className="flex items-center border border-outline-variant rounded">
                <button type="button" aria-label="Less" disabled={disabled || row.quantity <= 1} onClick={() => setQty(index, row.quantity - 1)} className="w-7 h-7 disabled:opacity-30">
                  −
                </button>
                <span className="w-7 text-center text-sm" aria-label="Quantity">
                  {row.quantity}
                </span>
                <button type="button" aria-label="More" disabled={disabled || row.quantity >= 20} onClick={() => setQty(index, row.quantity + 1)} className="w-7 h-7 disabled:opacity-30">
                  +
                </button>
              </div>
              <p className="w-20 text-right text-sm font-medium text-on-surface">{rupees(row.price * row.quantity)}</p>
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Remove ${row.productName}`}
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  className="w-7 h-7 rounded text-error hover:bg-error-container"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Product" value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(""); }} className={`${select} flex-1 min-w-[160px]`}>
            <option value="">Choose a product…</option>
            {choices.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Weight"
            value={variantId}
            disabled={!chosenProduct}
            onChange={(e) => setVariantId(e.target.value)}
            className={`${select} w-40 disabled:opacity-50`}
          >
            <option value="">Weight…</option>
            {chosenProduct?.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} - {rupees(v.price)}
              </option>
            ))}
          </select>
          <input
            aria-label="Quantity to add"
            type="number"
            min={1}
            max={20}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className={`${select} w-16`}
          />
          <button
            type="button"
            onClick={add}
            disabled={!variantId}
            className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary-fixed disabled:opacity-40"
          >
            + Add item
          </button>
        </div>
      )}
    </div>
  );
}
