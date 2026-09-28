import { useEffect, useMemo, useState } from "react";
import ComboItemsPicker from "./ComboItemsPicker";
import ComboPriceCompare from "./ComboPriceCompare";
import { fetchProducts, setComboItems } from "../api/productsApi";
import { comboValue, rowsFromComboItems } from "../lib/combo";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

/** "What's inside" on a combo's page: edit the items and compare with each pack price. */
export default function ComboContentsSection({ product, canUpdate, onSaved }) {
  const saved = useMemo(() => rowsFromComboItems(product.comboItems), [product.comboItems]);
  const [rows, setRows] = useState(saved);
  const [products, setProducts] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => setRows(saved), [saved]);
  useEffect(() => {
    if (canUpdate) fetchProducts({ includeInactive: false }).then(setProducts).catch(() => setProducts([]));
  }, [canUpdate]);

  const key = (list) => JSON.stringify(list.map((r) => [r.variantId, r.quantity]));
  const isDirty = key(rows) !== key(saved);
  const value = comboValue(rows);
  const problems = saved.filter((r) => r.problem);

  async function save() {
    if (rows.length === 0) {
      const ok = await showConfirm({
        title: "Empty the combo?",
        text: "It becomes a normal product with no items inside.",
        confirmButtonText: "Yes, empty it",
      });
      if (!ok) return;
    }
    setIsSaving(true);
    try {
      await setComboItems(product.id, rows.map((r) => ({ variantId: r.variantId, quantity: r.quantity })));
      showSuccess("Combo items saved.");
      onSaved();
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save the items.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">What's inside</h2>
      <p className="text-xs text-on-surface-variant mb-3">
        Customers see this list on the combo's page. If any item is switched off or out of stock, the combo hides from
        the shop by itself until it's back.
      </p>

      {problems.length > 0 && (
        <div className="mb-3 rounded bg-error-container text-on-error-container text-sm px-3 py-2">
          Hidden from the shop right now: {problems.map((p) => `${p.productName} (${p.label}) is ${p.problem}`).join("; ")}.
        </div>
      )}

      <ComboItemsPicker rows={rows} onChange={setRows} products={products} excludeProductId={product.id} disabled={!canUpdate} />

      <div className="mt-3 space-y-2">
        {product.variants.map((v) => (
          <ComboPriceCompare key={v.id} value={value} price={v.price} label={v.label} />
        ))}
      </div>

      {canUpdate && isDirty && (
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={() => setRows(saved)} className="text-sm px-3 py-1.5 rounded border border-outline-variant hover:bg-surface-container-low">
            Undo changes
          </button>
          <button type="button" onClick={save} disabled={isSaving} className="text-sm px-4 py-1.5 rounded bg-primary-container text-on-primary disabled:opacity-50">
            {isSaving ? "Saving…" : "Save items"}
          </button>
        </div>
      )}
    </section>
  );
}
