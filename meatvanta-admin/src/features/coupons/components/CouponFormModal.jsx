import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../../../components/common/Modal";
import Toggle from "../../../components/common/Toggle";
import { createCoupon, updateCoupon, fetchCoupon } from "../api/couponsApi";
import { fetchProducts } from "../../products/api/productsApi";
import { fetchCategories } from "../../categories/api/categoriesApi";
import { showSuccess, showError } from "../../../lib/sweetAlert";
import { toIstInput, fromIstInput, formatIst } from "../../banners/lib/placements";

const TYPES = [
  { id: "percent", label: "% off", help: "A percentage off the items, with an optional cap." },
  { id: "flat", label: "₹ off", help: "A fixed amount off the items." },
  { id: "free_delivery", label: "Free delivery", help: "The delivery charge becomes ₹0." },
];

function emptyForm() {
  return {
    code: "",
    description: "",
    type: "percent",
    value: "",
    maxDiscount: "",
    minOrderValue: "",
    appliesTo: "all",
    categoryIds: [],
    productIds: [],
    firstOrderOnly: false,
    perCustomerLimit: "1",
    totalLimit: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
    showOnSite: false,
  };
}

const str = (v) => (v === null || v === undefined ? "" : String(Number(v)));

/** Create / edit a coupon. `couponId` = edit, null = create. */
export default function CouponFormModal({ isOpen, couponId, onClose, onSaved }) {
  const isEdit = Boolean(couponId);
  const [form, setForm] = useState(emptyForm);
  const [existing, setExisting] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setExisting(null);
    if (!couponId) {
      setForm(emptyForm());
      return;
    }
    fetchCoupon(couponId)
      .then((c) => {
        setExisting(c);
        setForm({
          code: c.code,
          description: c.description || "",
          type: c.type,
          value: c.type === "free_delivery" ? "" : str(c.value),
          maxDiscount: str(c.maxDiscount),
          minOrderValue: str(c.minOrderValue),
          appliesTo: c.appliesTo,
          categoryIds: c.categoryIds || [],
          productIds: c.productIds || [],
          firstOrderOnly: c.firstOrderOnly,
          perCustomerLimit: str(c.perCustomerLimit),
          totalLimit: str(c.totalLimit),
          startsAt: toIstInput(c.startsAt),
          endsAt: toIstInput(c.endsAt),
          isActive: c.isActive,
          showOnSite: c.showOnSite,
        });
      })
      .catch((err) => setError(err.response?.data?.message || "Couldn't load the coupon."));
  }, [isOpen, couponId]);

  useEffect(() => {
    if (!isOpen || products.length || categories.length) return;
    fetchProducts({ includeInactive: false }).then(setProducts).catch(() => setProducts([]));
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, [isOpen, products.length, categories.length]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleId = (field, id) =>
    set({ [field]: form[field].includes(id) ? form[field].filter((x) => x !== id) : [...form[field], id] });

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) {
      return setError("The end time must be after the start time.");
    }
    const payload = {
      ...form,
      code: form.code.trim().toUpperCase(),
      startsAt: fromIstInput(form.startsAt),
      endsAt: fromIstInput(form.endsAt),
      appliesTo: form.type === "free_delivery" ? "all" : form.appliesTo,
    };
    setIsSaving(true);
    try {
      const saved = isEdit ? await updateCoupon(couponId, payload) : await createCoupon(payload);
      showSuccess(isEdit ? "Coupon saved." : "Coupon created.");
      onSaved(saved);
    } catch (err) {
      const message = err.response?.data?.message || "Couldn't save the coupon.";
      setError(message);
      showError(message);
    } finally {
      setIsSaving(false);
    }
  }

  const input = "w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary";
  const label = "block font-label-bold text-label-bold text-on-surface mb-1";
  const codeLocked = isEdit && existing?.usedCount > 0;

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEdit ? "Edit coupon" : "New coupon"} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="p-lg space-y-lg">
        {error && <div className="bg-error-container text-on-error-container rounded px-md py-sm text-sm">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <div>
            <label htmlFor="coupon-code" className={label}>
              Code customers type
            </label>
            <input
              id="coupon-code"
              required
              maxLength={30}
              disabled={codeLocked}
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })}
              placeholder="e.g. EID20"
              className={`${input} font-mono tracking-wider disabled:bg-surface-container-low`}
            />
            <p className="text-xs text-on-surface-variant mt-1">
              {codeLocked ? "Already used on orders, so the code can't change." : "Letters, numbers, - or _ · 3 to 30 characters."}
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-on-surface">Switched on</span>
              <Toggle checked={form.isActive} onChange={(v) => set({ isActive: v })} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-on-surface" title="Listed under Available offers in the cart">
                Show in cart's offers list
              </span>
              <Toggle checked={form.showOnSite} onChange={(v) => set({ showOnSite: v })} />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="coupon-desc" className={label}>
            What customers see (optional)
          </label>
          <input
            id="coupon-desc"
            maxLength={200}
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Leave empty to describe it automatically, e.g. 20% off, up to ₹150"
            className={input}
          />
        </div>

        {/* Discount */}
        <fieldset>
          <legend className={label}>Discount</legend>
          <div className="flex flex-wrap gap-2 mb-2">
            {TYPES.map((t) => (
              <label
                key={t.id}
                className={`text-sm px-3 py-1.5 rounded border cursor-pointer ${
                  form.type === t.id
                    ? "border-primary bg-primary-fixed text-on-primary-fixed"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                <input type="radio" name="type" className="sr-only" checked={form.type === t.id} onChange={() => set({ type: t.id })} />
                {t.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-on-surface-variant mb-3">{TYPES.find((t) => t.id === form.type)?.help}</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
            {form.type === "percent" && (
              <>
                <label className="text-sm text-on-surface-variant">
                  Percentage off
                  <div className="relative mt-1">
                    <input type="number" required min={1} max={90} step="0.5" value={form.value} onChange={(e) => set({ value: e.target.value })} className={`${input} pr-8`} />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant">%</span>
                  </div>
                </label>
                <label className="text-sm text-on-surface-variant">
                  Up to (₹, optional)
                  <input type="number" min={1} step="1" value={form.maxDiscount} onChange={(e) => set({ maxDiscount: e.target.value })} placeholder="No cap" className={`${input} mt-1`} />
                </label>
              </>
            )}
            {form.type === "flat" && (
              <label className="text-sm text-on-surface-variant">
                Amount off (₹)
                <input type="number" required min={1} step="1" value={form.value} onChange={(e) => set({ value: e.target.value })} className={`${input} mt-1`} />
              </label>
            )}
            <label className="text-sm text-on-surface-variant">
              Minimum order (₹, optional)
              <input type="number" min={1} step="1" value={form.minOrderValue} onChange={(e) => set({ minOrderValue: e.target.value })} placeholder="Any amount" className={`${input} mt-1`} />
            </label>
          </div>
        </fieldset>

        {/* Which items */}
        {form.type !== "free_delivery" && (
          <fieldset>
            <legend className={label}>Discount applies to</legend>
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { id: "all", label: "All items" },
                { id: "categories", label: "Some categories" },
                { id: "products", label: "Some products" },
              ].map((opt) => (
                <label
                  key={opt.id}
                  className={`text-sm px-3 py-1.5 rounded border cursor-pointer ${
                    form.appliesTo === opt.id
                      ? "border-primary bg-primary-fixed text-on-primary-fixed"
                      : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                  }`}
                >
                  <input type="radio" name="appliesTo" className="sr-only" checked={form.appliesTo === opt.id} onChange={() => set({ appliesTo: opt.id })} />
                  {opt.label}
                </label>
              ))}
            </div>
            {form.appliesTo === "categories" && (
              <CheckList items={categories} selected={form.categoryIds} onToggle={(id) => toggleId("categoryIds", id)} />
            )}
            {form.appliesTo === "products" && (
              <CheckList
                items={products.map((p) => ({ id: p.id, name: `${p.name} (${p.category?.name || ""})` }))}
                selected={form.productIds}
                onToggle={(id) => toggleId("productIds", id)}
              />
            )}
            {form.appliesTo !== "all" && (
              <p className="text-xs text-on-surface-variant mt-1">
                The discount is worked out only on these items. The minimum order still counts the whole cart.
              </p>
            )}
          </fieldset>
        )}

        {/* Limits */}
        <fieldset>
          <legend className={label}>Limits</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <label className="text-sm text-on-surface-variant">
              Uses per customer (by phone number)
              <input type="number" min={1} step="1" value={form.perCustomerLimit} onChange={(e) => set({ perCustomerLimit: e.target.value })} placeholder="Unlimited" className={`${input} mt-1`} />
            </label>
            <label className="text-sm text-on-surface-variant">
              Total uses
              <input type="number" min={1} step="1" value={form.totalLimit} onChange={(e) => set({ totalLimit: e.target.value })} placeholder="Unlimited" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-on-surface cursor-pointer">
            <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => set({ firstOrderOnly: e.target.checked })} className="accent-primary w-4 h-4" />
            Only for a customer's first order
          </label>
          <p className="text-xs text-on-surface-variant mt-1">A cancelled order gives its use back.</p>
        </fieldset>

        {/* When */}
        <fieldset>
          <legend className={label}>Valid (optional, India time)</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <label className="text-sm text-on-surface-variant">
              From
              <input type="datetime-local" value={form.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="text-sm text-on-surface-variant">
              Until
              <input type="datetime-local" value={form.endsAt} min={form.startsAt || undefined} onChange={(e) => set({ endsAt: e.target.value })} className={`${input} mt-1`} />
            </label>
          </div>
        </fieldset>

        {isEdit && existing?.redemptions?.length > 0 && (
          <div>
            <p className={label}>Used on ({existing.usedCount})</p>
            <ul className="max-h-40 overflow-auto border border-outline-variant rounded divide-y divide-outline-variant text-sm">
              {existing.redemptions.map((r) => (
                <li key={r.id} className="flex justify-between gap-3 px-3 py-1.5">
                  <Link to={`/orders/${r.order.id}`} className="text-primary hover:underline">
                    {r.order.orderNumber}
                  </Link>
                  <span className="text-on-surface-variant truncate">{r.order.customerName}</span>
                  <span className="tabular-nums">saved ₹{Number(r.discount).toFixed(0)}</span>
                  <span className="text-on-surface-variant text-xs whitespace-nowrap">{formatIst(r.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-md border-t border-outline-variant">
          <button type="button" onClick={onClose} disabled={isSaving} className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">
            Cancel
          </button>
          <button type="submit" disabled={isSaving} className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50">
            {isSaving ? "Saving…" : isEdit ? "Save coupon" : "Create coupon"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CheckList({ items, selected, onToggle }) {
  return (
    <div className="max-h-44 overflow-auto border border-outline-variant rounded p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
      {items.length === 0 && <p className="text-sm text-on-surface-variant p-1">Loading…</p>}
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-2 text-sm text-on-surface px-1 py-0.5 rounded hover:bg-surface-container-low cursor-pointer">
          <input type="checkbox" checked={selected.includes(item.id)} onChange={() => onToggle(item.id)} className="accent-primary w-4 h-4" />
          {item.name}
        </label>
      ))}
    </div>
  );
}
