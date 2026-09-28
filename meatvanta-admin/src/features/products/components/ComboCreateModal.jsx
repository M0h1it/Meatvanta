import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../../../components/common/Modal";
import ComboItemsPicker from "./ComboItemsPicker";
import ComboPriceCompare from "./ComboPriceCompare";
import { createCombo, fetchProducts } from "../api/productsApi";
import { comboValue } from "../lib/combo";
import { showSuccess, showError } from "../../../lib/sweetAlert";

/**
 * "New combo": pick items from existing products, set one price.
 * Photos, tags and the rest are added on the combo's page afterwards,
 * exactly like any product.
 */
export default function ComboCreateModal({ isOpen, categories, onClose }) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Suggest a category whose name mentions "combo", else the first one.
    const comboCategory = categories.find((c) => /combo|pack/i.test(c.name)) || categories[0];
    setForm({ name: "", categoryId: comboCategory?.id || "", description: "", price: "", mrp: "", label: "1 Pack", rows: [] });
    fetchProducts({ includeInactive: false })
      .then(setProducts)
      .catch(() => showError("Couldn't load products."));
  }, [isOpen, categories]);

  if (!isOpen || !form) return null;
  const value = comboValue(form.rows);

  async function submit(e) {
    e.preventDefault();
    if (form.rows.length === 0) {
      showError("Add at least one item to the combo.");
      return;
    }
    setIsSaving(true);
    try {
      const product = await createCombo({
        name: form.name,
        categoryId: Number(form.categoryId),
        description: form.description,
        price: Number(form.price),
        mrp: form.mrp === "" ? null : Number(form.mrp),
        label: form.label,
        items: form.rows.map((r) => ({ variantId: r.variantId, quantity: r.quantity })),
      });
      showSuccess("Combo created. Now add its photos.");
      onClose();
      navigate(`/products/${product.id}`);
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't create the combo.");
    } finally {
      setIsSaving(false);
    }
  }

  const input = "w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="New combo" maxWidth="max-w-3xl">
      <form onSubmit={submit} className="space-y-md">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <label className="block text-sm text-on-surface-variant">
            Combo name
            <input required minLength={2} maxLength={150} placeholder="e.g. Sunday Feast Combo" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={`${input} mt-1`} />
          </label>
          <label className="block text-sm text-on-surface-variant">
            Shows under (category)
            <select required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className={`${input} mt-1`}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="block text-xs mt-1">Tip: make a category called "Combos" so they get their own tab in the shop.</span>
          </label>
        </div>

        <div>
          <p className="font-label-bold text-label-bold text-on-surface mb-2">What's inside</p>
          <ComboItemsPicker rows={form.rows} onChange={(rows) => setForm({ ...form, rows })} products={products} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
          <label className="block text-sm text-on-surface-variant">
            Combo price (₹)
            <input required type="number" min={1} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={`${input} mt-1`} />
          </label>
          <label className="block text-sm text-on-surface-variant">
            MRP (optional)
            <input type="number" min={1} step="0.01" placeholder={value ? String(value) : "—"} value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} className={`${input} mt-1`} />
            {value > 0 && Number(form.price) > 0 && Number(form.price) < value && form.mrp === "" && (
              <button type="button" onClick={() => setForm({ ...form, mrp: String(value) })} className="text-xs text-primary underline mt-1">
                Use {`₹${value}`} (items' total) as MRP
              </button>
            )}
          </label>
          <label className="block text-sm text-on-surface-variant">
            Pack name
            <input maxLength={50} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={`${input} mt-1`} />
          </label>
        </div>

        <ComboPriceCompare value={value} price={form.price} />

        <label className="block text-sm text-on-surface-variant">
          Description (optional)
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={`${input} mt-1`} />
        </label>

        <div className="flex justify-end gap-2 pt-md border-t border-outline-variant">
          <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="text-sm px-5 py-2 rounded bg-primary-container text-on-primary disabled:opacity-50">
            {isSaving ? "Creating…" : "Create combo"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
