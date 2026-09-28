import { useEffect, useState } from "react";
import Modal from "../../../components/common/Modal";
import Toggle from "../../../components/common/Toggle";
import { fetchBestsellerSettings, updateBestsellerSettings } from "../api/productsApi";
import { showSuccess, showError } from "../../../lib/sweetAlert";

/** Automatic "Bestseller" label on the products that sold the most recently. */
export default function BestsellerSettingsModal({ isOpen, products, onClose }) {
  const [settings, setSettings] = useState(null);
  const [productIds, setProductIds] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    fetchBestsellerSettings()
      .then((d) => {
        setSettings(d.settings);
        setProductIds(d.productIds);
      })
      .catch((err) => showError(err.response?.data?.message || "Couldn't load the settings."));
  }, [isOpen]);

  async function save() {
    setIsSaving(true);
    try {
      const d = await updateBestsellerSettings({
        enabled: settings.enabled,
        count: Number(settings.count),
        days: Number(settings.days),
        label: settings.label,
      });
      setSettings(d.settings);
      setProductIds(d.productIds);
      showSuccess("Bestseller settings saved.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save.");
    } finally {
      setIsSaving(false);
    }
  }

  const names = productIds.map((id) => products.find((p) => p.id === id)?.name || `#${id}`);
  const input = "w-full text-sm rounded border border-outline-variant px-3 py-2 mt-1";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Automatic Bestseller label">
      {!settings ? (
        <p className="p-lg text-sm text-on-surface-variant">Loading…</p>
      ) : (
        <div className="p-lg space-y-md">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-on-surface">Add the label automatically</p>
            <Toggle checked={settings.enabled} onChange={(v) => setSettings({ ...settings, enabled: v })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
            <label className="text-sm text-on-surface-variant">
              Label
              <input maxLength={30} value={settings.label} onChange={(e) => setSettings({ ...settings, label: e.target.value })} className={input} />
            </label>
            <label className="text-sm text-on-surface-variant">
              Top how many
              <input type="number" min={1} max={20} value={settings.count} onChange={(e) => setSettings({ ...settings, count: e.target.value })} className={input} />
            </label>
            <label className="text-sm text-on-surface-variant">
              Look back (days)
              <input type="number" min={7} max={365} value={settings.days} onChange={(e) => setSettings({ ...settings, days: e.target.value })} className={input} />
            </label>
          </div>
          <p className="text-xs text-on-surface-variant">
            Counts units from delivered orders. A product needs at least {settings.minUnits} sold to qualify, and it updates
            by itself every few minutes.
          </p>
          <div className="rounded border border-outline-variant p-3 bg-surface-container-low">
            <p className="text-sm font-semibold text-on-surface mb-1">Right now it's on:</p>
            {settings.enabled && names.length > 0 ? (
              <ol className="list-decimal list-inside text-sm text-on-surface">
                {names.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-on-surface-variant">{settings.enabled ? "No product has enough sales yet." : "Switched off."}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-md border-t border-outline-variant">
            <button type="button" onClick={onClose} className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">
              Close
            </button>
            <button type="button" onClick={save} disabled={isSaving} className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary disabled:opacity-50">
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
