import { useState } from "react";
import { addProductTag, updateProductTag, deleteProductTag } from "../api/productsApi";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import { TAG_COLORS, TAG_COLOR_CLASS, TAG_PRESETS } from "../lib/tagColors";
import { toIstInput, fromIstInput, formatIst } from "../../banners/lib/placements";

const MAX_TAGS = 5;
const EMPTY = { label: "", color: "red", startsAt: "", endsAt: "", showCountdown: false };

function statusOf(tag, now = new Date()) {
  if (tag.startsAt && new Date(tag.startsAt) > now) return "Scheduled";
  if (tag.endsAt && new Date(tag.endsAt) <= now) return "Ended";
  return "Live";
}

/**
 * Labels shown on this product's card and page. Up to 5; the first two live
 * ones show on the card. A tag with a countdown needs an end time ("deal").
 */
export default function ProductTagsEditor({ product, canUpdate, onChange }) {
  const tags = product.tags || [];
  const [form, setForm] = useState(null); // null = closed, { id?, ...fields }
  const [isSaving, setIsSaving] = useState(false);

  function openNew(preset) {
    const endsAt = preset?.showCountdown ? toIstInput(new Date(Date.now() + 24 * 3600e3).toISOString()) : "";
    setForm({ ...EMPTY, ...preset, endsAt });
  }

  function openEdit(tag) {
    setForm({
      id: tag.id,
      label: tag.label,
      color: tag.color,
      startsAt: toIstInput(tag.startsAt),
      endsAt: toIstInput(tag.endsAt),
      showCountdown: tag.showCountdown,
    });
  }

  async function save(e) {
    e.preventDefault();
    const payload = {
      label: form.label,
      color: form.color,
      startsAt: fromIstInput(form.startsAt),
      endsAt: fromIstInput(form.endsAt),
      showCountdown: form.showCountdown,
    };
    setIsSaving(true);
    try {
      if (form.id) await updateProductTag(form.id, payload);
      else await addProductTag(product.id, payload);
      showSuccess(form.id ? "Tag saved." : "Tag added.");
      setForm(null);
      onChange();
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save the tag.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(tag) {
    const ok = await showConfirm({ title: `Remove "${tag.label}"?`, text: "It disappears from the shop straight away.", confirmButtonText: "Remove" });
    if (!ok) return;
    try {
      await deleteProductTag(tag.id);
      showSuccess("Tag removed.");
      onChange();
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't remove the tag.");
    }
  }

  const input = "w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary";

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Tags</h2>
      <p className="text-xs text-on-surface-variant mb-3">
        Labels on the product card and page, e.g. "Eid Special". The first two live tags show on the card. "Bestseller"
        can also be added automatically (Products page → Bestseller).
      </p>

      {tags.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {tags.map((tag) => {
            const status = statusOf(tag);
            return (
              <li key={tag.id} className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-sm ${TAG_COLOR_CLASS[tag.color] || TAG_COLOR_CLASS.red}`}>
                  {tag.label}
                </span>
                <span className={`text-xs ${status === "Live" ? "text-on-secondary-fixed-variant" : "text-on-surface-variant"}`}>{status}</span>
                <span className="text-xs text-on-surface-variant">
                  {tag.showCountdown ? "countdown · " : ""}
                  {tag.endsAt ? `until ${formatIst(tag.endsAt)}` : tag.startsAt ? `from ${formatIst(tag.startsAt)}` : ""}
                </span>
                {canUpdate && (
                  <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => openEdit(tag)} className="text-xs px-2 py-1 rounded border border-outline-variant hover:bg-surface-container-low">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(tag)} className="text-xs px-2 py-1 rounded border border-outline-variant text-error hover:bg-error-container">
                      Remove
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-outline mb-3">No tags yet.</p>
      )}

      {canUpdate && !form && tags.length < MAX_TAGS && (
        <div className="flex flex-wrap gap-1.5">
          {TAG_PRESETS.map((p) => (
            <button key={p.label} type="button" onClick={() => openNew(p)} className="text-xs px-2.5 py-1 rounded-full border border-outline-variant hover:bg-surface-container-low">
              + {p.label}
            </button>
          ))}
          <button type="button" onClick={() => openNew()} className="text-xs px-2.5 py-1 rounded-full border border-primary text-primary hover:bg-primary-fixed">
            + Custom tag
          </button>
        </div>
      )}

      {form && (
        <form onSubmit={save} className="mt-3 border border-outline-variant rounded p-3 space-y-3 bg-surface-container-low">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-on-surface-variant">
              Text (max 30)
              <input required maxLength={30} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={`${input} mt-1`} />
            </label>
            <div className="text-sm text-on-surface-variant">
              Colour
              <div className="flex gap-1.5 mt-1.5" role="radiogroup" aria-label="Tag colour">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={form.color === c.id}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => setForm({ ...form, color: c.id })}
                    className={`w-8 h-8 rounded-full ${c.className} ${form.color === c.id ? "ring-2 ring-offset-2 ring-primary" : ""}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-on-surface-variant">
              Show from (optional)
              <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="text-sm text-on-surface-variant">
              Until {form.showCountdown ? "(required)" : "(optional)"}
              <input
                type="datetime-local"
                required={form.showCountdown}
                value={form.endsAt}
                min={form.startsAt || undefined}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
                className={`${input} mt-1`}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-on-surface cursor-pointer">
            <input type="checkbox" checked={form.showCountdown} onChange={(e) => setForm({ ...form, showCountdown: e.target.checked })} className="accent-primary w-4 h-4" />
            Show a countdown to the end time ("Ends in 03:12:45")
          </label>
          <div className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant">Preview:</span>
            <span className={`text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-sm ${TAG_COLOR_CLASS[form.color]}`}>{form.label || "Tag"}</span>
            <span className="ml-auto flex gap-2">
              <button type="button" onClick={() => setForm(null)} className="text-sm px-3 py-1.5 rounded border border-outline-variant hover:bg-surface-container">
                Cancel
              </button>
              <button type="submit" disabled={isSaving} className="text-sm px-3 py-1.5 rounded bg-primary-container text-on-primary disabled:opacity-50">
                {isSaving ? "Saving…" : form.id ? "Save tag" : "Add tag"}
              </button>
            </span>
          </div>
        </form>
      )}
    </section>
  );
}
