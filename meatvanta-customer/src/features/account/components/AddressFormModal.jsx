import { useState } from "react";
import { createAddress, updateAddress } from "../api/addressesApi";
import MapPinPicker from "../../../components/common/MapPinPicker";

const LABEL_OPTIONS = ["Home", "Work", "Other"];

/**
 * Used both in the account page and inline at checkout.
 * onSaved receives the saved address so the caller can select it immediately.
 */
export default function AddressFormModal({ isOpen, onClose, onSaved, existingAddress = null }) {
  const isEditing = !!existingAddress;

  const [form, setForm] = useState(() => ({
    label: existingAddress?.label || "Home",
    addressLine: existingAddress?.addressLine || "",
    area: existingAddress?.area || "",
    pincode: existingAddress?.pincode || "",
    isDefault: existingAddress?.isDefault ?? false,
  }));
  // Exact map pin (optional). Saved addresses carry it as latitude/longitude.
  const [pin, setPin] = useState(() =>
    existingAddress?.latitude != null && existingAddress?.longitude != null
      ? { latitude: Number(existingAddress.latitude), longitude: Number(existingAddress.longitude) }
      : null
  );
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsSaving(true);
    try {
      const payload = {
        label: form.label,
        addressLine: form.addressLine,
        area: form.area || undefined,
        pincode: form.pincode || undefined,
        isDefault: form.isDefault,
        // null clears a pin that was removed while editing; new addresses just send null.
        latitude: pin ? pin.latitude : null,
        longitude: pin ? pin.longitude : null,
      };
      const saved = isEditing
        ? await updateAddress(existingAddress.id, payload)
        : await createAddress(payload);
      onSaved(saved);
      onClose();
    } catch (err) {
      const data = err.response?.data;
      const fieldLevel = data?.errors || {};
      setFieldErrors(fieldLevel);
      // A generic banner on top of a field error just says the same thing
      // twice - only show it when nothing is pinned to a specific field.
      setError(Object.keys(fieldLevel).length > 0 ? null : data?.message || "Couldn't save the address.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded p-6 pb-8 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-ink">
            {isEditing ? "Edit Address" : "Add Address"}
          </h2>
          <button onClick={onClose} className="text-ink/40 hover:text-ink" aria-label="Close">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-ink mb-1">Save as</label>
          <div className="flex gap-2 mb-4">
            {LABEL_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setForm({ ...form, label: option })}
                className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  form.label === option
                    ? "bg-brand-dark text-surface border-brand-dark"
                    : "bg-white text-ink border-ink/15"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="block text-sm font-semibold text-ink mb-1">
            Full Address <span className="text-brand">*</span>
          </label>
          <textarea
            required
            rows={3}
            placeholder="House / flat number, building, street, landmark"
            value={form.addressLine}
            onChange={(e) => setForm({ ...form, addressLine: e.target.value })}
            className="w-full rounded-sm border border-ink/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
          />
          {fieldErrors.addressLine ? (
            <p className="text-xs text-brand mt-1">{fieldErrors.addressLine}</p>
          ) : (
            <p className="text-xs text-ink/50 mt-1">
              The more detail you give, the easier it is for our delivery boy to find you.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-sm font-semibold text-ink mb-1">
                Area / Sector <span className="font-normal text-ink/40">(optional)</span>
              </label>
              <input
                placeholder="e.g. Sector 45"
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
                className="w-full rounded-sm border border-ink/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink mb-1">
                Pincode <span className="font-normal text-ink/40">(optional)</span>
              </label>
              <input
                inputMode="numeric"
                maxLength={6}
                placeholder="122001"
                value={form.pincode}
                onChange={(e) => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })}
                className="w-full rounded-sm border border-ink/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-dark"
              />
              {fieldErrors.pincode && <p className="text-xs text-brand mt-1">{fieldErrors.pincode}</p>}
            </div>
          </div>

          <div className="mt-4">
            <MapPinPicker value={pin} onChange={setPin} />
            {fieldErrors.latitude && <p className="text-xs text-brand mt-1">{fieldErrors.latitude}</p>}
          </div>

          <label className="flex items-center gap-2 mt-4 text-sm text-ink">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Make this my default address
          </label>

          {error && <p className="text-xs text-brand mt-3">{error}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full mt-5 bg-brand text-white font-bold py-3.5 rounded-full hover:opacity-90 disabled:opacity-40"
          >
            {isSaving ? "Saving..." : "Save Address"}
          </button>
        </form>
      </div>
    </div>
  );
}