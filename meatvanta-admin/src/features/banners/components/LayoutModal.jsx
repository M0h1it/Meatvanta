import { useEffect, useState } from "react";
import Modal from "../../../components/common/Modal";
import Toggle from "../../../components/common/Toggle";
import { updateBannerLayout } from "../api/bannersApi";
import { showSuccess, showError } from "../../../lib/sweetAlert";
import { DESKTOP_RATIOS, MOBILE_RATIOS, DEFAULT_LAYOUT, recommendedSize, PLACEMENT_BY_ID } from "../lib/placements";
import BannerPreview from "./BannerPreview";

/**
 * Sets the shape of one banner spot. Every banner in the spot then shows at
 * this shape, so a slider never changes height between slides.
 */
export default function LayoutModal({ placement, layout, sampleBanner, onClose, onSaved }) {
  const [form, setForm] = useState(layout || DEFAULT_LAYOUT);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setForm(layout || DEFAULT_LAYOUT);
  }, [layout, placement]);

  if (!placement) return null;
  const info = PLACEMENT_BY_ID[placement];

  async function save() {
    setIsSaving(true);
    try {
      const saved = await updateBannerLayout(placement, form);
      showSuccess("Shape saved.");
      onSaved(saved);
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save the shape.");
    } finally {
      setIsSaving(false);
    }
  }

  const select = "w-full text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest";
  const desktopSize = recommendedSize(form.desktopRatio, "desktop");
  const phoneSize = recommendedSize(form.mobileRatio, "phone");

  return (
    <Modal isOpen onClose={isSaving ? () => {} : onClose} title={`Shape - ${info?.label || placement}`} maxWidth="max-w-2xl">
      <div className="p-lg space-y-lg">
        <p className="text-sm text-on-surface-variant">
          A fixed shape keeps every banner here the same size, so the page never jumps. Pictures that don't match are
          trimmed to fit - choose which part to keep with "Keep in view" on each banner. "Auto" shows each picture at its
          own shape.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <label className="text-sm text-on-surface-variant">
            On computers
            <select value={form.desktopRatio} onChange={(e) => setForm({ ...form, desktopRatio: e.target.value })} className={`${select} mt-1`}>
              {DESKTOP_RATIOS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="block text-xs mt-1">{desktopSize ? `Design at ${desktopSize}` : "Any size - shown as uploaded"}</span>
          </label>
          <label className="text-sm text-on-surface-variant">
            On phones
            <select value={form.mobileRatio} onChange={(e) => setForm({ ...form, mobileRatio: e.target.value })} className={`${select} mt-1`}>
              {MOBILE_RATIOS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <span className="block text-xs mt-1">{phoneSize ? `Design the phone version at ${phoneSize}` : "Any size - shown as uploaded"}</span>
          </label>
        </div>

        {placement !== "popup" && (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-on-surface">Full width</p>
              <p className="text-xs text-on-surface-variant">Edge to edge, no side margin or rounded corners.</p>
            </div>
            <Toggle checked={form.fullWidth} onChange={(v) => setForm({ ...form, fullWidth: v })} />
          </div>
        )}

        {sampleBanner?.desktopUrl && (
          <div>
            <p className="font-label-bold text-label-bold text-on-surface mb-2">Preview with "{sampleBanner.title}"</p>
            <BannerPreview
              desktopUrl={sampleBanner.desktopUrl}
              mobileUrl={sampleBanner.mobileUrl}
              isVideo={sampleBanner.mediaType === "video"}
              layout={form}
              focus={sampleBanner.focus}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-md border-t border-outline-variant">
          <button type="button" onClick={onClose} disabled={isSaving} className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={isSaving} className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50">
            {isSaving ? "Saving…" : "Save shape"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
