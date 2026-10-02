import { useEffect, useState } from "react";
import { fetchNewCustomerOffer, saveNewCustomerOffer } from "../api/couponsApi";
import { showSuccess, showError } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";

const blankIfNull = (v) => (v === null || v === undefined ? "" : String(v));

/**
 * Welcome offer for first-time customers: % off the first order, for the
 * payment methods ticked here. Customers never type a code - it is applied
 * automatically (and only when it saves more than a coupon they entered).
 */
export default function NewCustomerOfferCard({ canUpdate }) {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchNewCustomerOffer()
      .then((s) => {
        setSaved(s);
        setForm({
          enabled: s.enabled,
          percent: String(s.percent),
          maxDiscount: blankIfNull(s.maxDiscount),
          minOrderValue: blankIfNull(s.minOrderValue),
          applyOnline: s.applyOnline,
          applyCod: s.applyCod,
        });
      })
      .catch(() => setForm(null));
  }, []);

  if (!form) return null;

  const dirty =
    saved &&
    (form.enabled !== saved.enabled ||
      Number(form.percent) !== Number(saved.percent) ||
      form.maxDiscount !== blankIfNull(saved.maxDiscount) ||
      form.minOrderValue !== blankIfNull(saved.minOrderValue) ||
      form.applyOnline !== saved.applyOnline ||
      form.applyCod !== saved.applyCod);

  async function handleSave() {
    setIsSaving(true);
    try {
      const next = await saveNewCustomerOffer({
        enabled: form.enabled,
        percent: Number(form.percent),
        maxDiscount: form.maxDiscount === "" ? null : Number(form.maxDiscount),
        minOrderValue: form.minOrderValue === "" ? null : Number(form.minOrderValue),
        applyOnline: form.applyOnline,
        applyCod: form.applyCod,
      });
      setSaved(next);
      showSuccess("New customer offer saved.");
    } catch (err) {
      showError(err.response?.data?.message || "Could not save the offer.");
    } finally {
      setIsSaving(false);
    }
  }

  const field = "w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-container-low";
  const disabled = !canUpdate;

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md mb-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">celebration</span>
            New customer offer
          </h2>
          <p className="text-sm text-on-surface-variant mt-0.5">
            A welcome discount on a customer's first order. Applied automatically - no code to type. If a customer also
            enters a coupon, they get whichever saves them more (never both).
          </p>
        </div>
        <Toggle checked={form.enabled} disabled={disabled} onChange={(v) => setForm({ ...form, enabled: v })} />
      </div>

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-md mt-md ${form.enabled ? "" : "opacity-60"}`}>
        <div>
          <label className="block font-label-bold text-label-bold text-on-surface mb-1">Discount (%)</label>
          <input type="number" min="1" max="90" value={form.percent} disabled={disabled}
            onChange={(e) => setForm({ ...form, percent: e.target.value })} className={field} />
        </div>
        <div>
          <label className="block font-label-bold text-label-bold text-on-surface mb-1">Maximum discount (₹)</label>
          <input type="number" min="1" value={form.maxDiscount} placeholder="No limit" disabled={disabled}
            onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} className={field} />
        </div>
        <div>
          <label className="block font-label-bold text-label-bold text-on-surface mb-1">Minimum order (₹)</label>
          <input type="number" min="1" value={form.minOrderValue} placeholder="No minimum" disabled={disabled}
            onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} className={field} />
        </div>
      </div>

      <div className={`mt-md ${form.enabled ? "" : "opacity-60"}`}>
        <p className="font-label-bold text-label-bold text-on-surface mb-1">Applies when the customer pays by</p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-on-surface">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.applyOnline} disabled={disabled}
              onChange={(e) => setForm({ ...form, applyOnline: e.target.checked })} />
            Online payment (UPI / card / netbanking)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.applyCod} disabled={disabled}
              onChange={(e) => setForm({ ...form, applyCod: e.target.checked })} />
            Cash on delivery
          </label>
        </div>
        <p className="text-xs text-on-surface-variant mt-2">
          A "new customer" is a phone number with no earlier order (cancelled orders don't count). The discount is taken
          off the items, not the delivery charge.
        </p>
      </div>

      {canUpdate && (
        <div className="flex justify-end mt-md">
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || isSaving}
            className="bg-primary-container text-on-primary text-sm px-5 py-2 rounded hover:opacity-90 disabled:opacity-40"
          >
            {isSaving ? "Saving…" : "Save offer"}
          </button>
        </div>
      )}
    </section>
  );
}
