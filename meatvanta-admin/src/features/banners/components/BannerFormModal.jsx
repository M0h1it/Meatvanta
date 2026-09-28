import { useEffect, useMemo, useState } from "react";
import Modal from "../../../components/common/Modal";
import Toggle from "../../../components/common/Toggle";
import { createBanner, updateBanner } from "../api/bannersApi";
import { fetchProducts } from "../../products/api/productsApi";
import { fetchCategories } from "../../categories/api/categoriesApi";
import { showSuccess, showError } from "../../../lib/sweetAlert";
import {
  PLACEMENTS,
  PLACEMENT_BY_ID,
  toIstInput,
  fromIstInput,
  FOCUS_POINTS,
  DEFAULT_LAYOUT,
  recommendedSize,
} from "../lib/placements";
import BannerPreview from "./BannerPreview";

const MEDIA_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 15;

const isVideoFile = (file) => file && file.type.startsWith("video/");

/** Checks a picked file before upload so the admin sees the problem straight away. */
function checkFile(file, { imageOnly = false } = {}) {
  if (!file) return null;
  const allowed = (imageOnly ? IMAGE_ACCEPT : MEDIA_ACCEPT).split(",");
  if (!allowed.includes(file.type)) {
    return imageOnly ? "Choose a JPG, PNG or WebP image." : "Choose a JPG, PNG, WebP, GIF, MP4 or WebM file.";
  }
  const limit = isVideoFile(file) ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (file.size > limit * 1024 * 1024) return `"${file.name}" is larger than ${limit} MB.`;
  return null;
}

function emptyForm(placement) {
  return {
    title: "",
    placement: placement || "home_top",
    text: "",
    altText: "",
    focus: "center",
    linkType: "none",
    linkValue: "",
    startsAt: "",
    endsAt: "",
    isActive: true,
    desktopFile: null,
    mobileFile: null,
    posterFile: null,
    removeMobile: false,
    removePoster: false,
  };
}

/**
 * Create / edit one banner. `banner` = existing banner to edit, or null to create
 * (optionally with `defaultPlacement` pre-selected).
 */
export default function BannerFormModal({ isOpen, banner, defaultPlacement, layouts = {}, onClose, onSaved }) {
  const isEdit = Boolean(banner);
  const [form, setForm] = useState(() => emptyForm(defaultPlacement));
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setProgress(null);
    setForm(
      banner
        ? {
            ...emptyForm(banner.placement),
            title: banner.title,
            text: banner.text || "",
            altText: banner.altText || "",
            focus: banner.focus || "center",
            linkType: banner.linkType || "none",
            linkValue: banner.linkValue || "",
            startsAt: toIstInput(banner.startsAt),
            endsAt: toIstInput(banner.endsAt),
            isActive: banner.isActive,
          }
        : emptyForm(defaultPlacement)
    );
  }, [isOpen, banner, defaultPlacement]);

  // Link targets load once, the first time the form opens.
  useEffect(() => {
    if (!isOpen || products.length || categories.length) return;
    fetchProducts({ includeInactive: false }).then(setProducts).catch(() => setProducts([]));
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, [isOpen, products.length, categories.length]);

  const placement = PLACEMENT_BY_ID[form.placement];
  const isText = placement?.isText;
  const layout = layouts[form.placement] || DEFAULT_LAYOUT;
  const hasFixedShape = layout.desktopRatio !== "auto" || layout.mobileRatio !== "auto";
  const desktopSize = recommendedSize(layout.desktopRatio, "desktop");
  const phoneSize = recommendedSize(layout.mobileRatio, "phone");
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  // Type of the main file after saving: the newly picked file, else what is stored.
  const mainIsVideo = form.desktopFile ? isVideoFile(form.desktopFile) : banner?.mediaType === "video";

  // Local previews for picked files.
  const previews = useMemo(() => {
    const make = (file) => (file ? URL.createObjectURL(file) : null);
    return { desktop: make(form.desktopFile), mobile: make(form.mobileFile), poster: make(form.posterFile) };
  }, [form.desktopFile, form.mobileFile, form.posterFile]);
  useEffect(() => () => Object.values(previews).forEach((u) => u && URL.revokeObjectURL(u)), [previews]);

  function pickFile(slot, file, opts) {
    const problem = checkFile(file, opts);
    if (problem) {
      showError(problem);
      return;
    }
    set({ [`${slot}File`]: file, ...(slot === "mobile" ? { removeMobile: false } : {}), ...(slot === "poster" ? { removePoster: false } : {}) });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!isText && !isEdit && !form.desktopFile) return setError("Upload the banner image or video.");
    if (form.mobileFile && isVideoFile(form.mobileFile) !== mainIsVideo) {
      return setError("The phone version must be the same type as the main file (both images or both videos).");
    }
    if (form.startsAt && form.endsAt && form.endsAt <= form.startsAt) {
      return setError("The end time must be after the start time.");
    }

    const fd = new FormData();
    fd.append("title", form.title);
    fd.append("placement", form.placement);
    if (isText) fd.append("text", form.text);
    fd.append("altText", form.altText);
    if (!isText) fd.append("focus", form.focus);
    fd.append("linkType", form.linkType);
    fd.append("linkValue", form.linkType === "none" ? "" : form.linkValue);
    fd.append("startsAt", fromIstInput(form.startsAt));
    fd.append("endsAt", fromIstInput(form.endsAt));
    fd.append("isActive", String(form.isActive));
    if (form.desktopFile) fd.append("desktop", form.desktopFile);
    if (form.mobileFile) fd.append("mobile", form.mobileFile);
    if (form.posterFile && mainIsVideo) fd.append("poster", form.posterFile);
    if (form.removeMobile) fd.append("removeMobile", "true");
    if (form.removePoster) fd.append("removePoster", "true");

    setIsSaving(true);
    setProgress(0);
    try {
      const saved = isEdit ? await updateBanner(banner.id, fd, setProgress) : await createBanner(fd, setProgress);
      showSuccess(isEdit ? "Banner saved." : "Banner created.");
      onSaved(saved);
    } catch (err) {
      const message = err.response?.data?.message || "Couldn't save the banner.";
      setError(message);
      showError(message);
    } finally {
      setIsSaving(false);
      setProgress(null);
    }
  }

  const currentMobile = !form.removeMobile && banner?.mobileUrl;
  const currentPoster = !form.removePoster && banner?.posterUrl;

  return (
    <Modal isOpen={isOpen} onClose={isSaving ? () => {} : onClose} title={isEdit ? "Edit banner" : "New banner"} maxWidth="max-w-3xl">
      <form onSubmit={handleSubmit} className="p-lg space-y-lg">
        {error && <div className="bg-error-container text-on-error-container rounded px-md py-sm text-sm">{error}</div>}

        {/* Where */}
        <div>
          <label htmlFor="banner-placement" className="block font-label-bold text-label-bold text-on-surface mb-1">
            Where should it appear?
          </label>
          <select
            id="banner-placement"
            value={form.placement}
            onChange={(e) => set({ placement: e.target.value })}
            className="w-full text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {/* An existing text announcement can't become an image banner (or back). */}
            {PLACEMENTS.filter((p) => !isEdit || Boolean(p.isText) === (banner.placement === "announcement")).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {placement && (
            <p className="text-xs text-on-surface-variant mt-1.5">
              {placement.where}{" "}
              <span className="text-outline">
                ·{" "}
                {placement.isText
                  ? placement.size
                  : desktopSize || phoneSize
                    ? `Design at: computer ${desktopSize || "any size"} · phone ${phoneSize || "any size"}`
                    : placement.size}
              </span>
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
          <div>
            <label htmlFor="banner-title" className="block font-label-bold text-label-bold text-on-surface mb-1">
              Name (only you see this)
            </label>
            <input
              id="banner-title"
              required
              maxLength={150}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="e.g. Eid offer - mutton 20% off"
              className="w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div className="flex items-end">
            <div className="flex items-center gap-3">
              <span className="text-sm text-on-surface">Switched on</span>
              <Toggle checked={form.isActive} onChange={(next) => set({ isActive: next })} />
            </div>
          </div>
        </div>

        {/* What */}
        {isText ? (
          <div>
            <label htmlFor="banner-text" className="block font-label-bold text-label-bold text-on-surface mb-1">
              Announcement text
            </label>
            <input
              id="banner-text"
              required
              maxLength={200}
              value={form.text}
              onChange={(e) => set({ text: e.target.value })}
              placeholder="e.g. Free delivery on orders above ₹999 this weekend"
              className="w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-on-surface-variant mt-1">{form.text.length}/200</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            <FileSlot
              label="Main image or video"
              help="Shown on computers - and on phones too if you skip the phone version. JPG, PNG, WebP, GIF (up to 10 MB) or MP4 / WebM video (up to 15 MB)."
              accept={MEDIA_ACCEPT}
              required={!isEdit}
              previewUrl={previews.desktop || banner?.desktopUrl}
              previewIsVideo={mainIsVideo}
              onPick={(file) => pickFile("desktop", file)}
            />
            <FileSlot
              label="Phone version (optional)"
              help={`A taller crop for phones. Must be ${mainIsVideo ? "a video" : "an image"}, like the main file.`}
              accept={mainIsVideo ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp,image/gif"}
              previewUrl={previews.mobile || currentMobile || null}
              previewIsVideo={form.mobileFile ? isVideoFile(form.mobileFile) : mainIsVideo}
              onPick={(file) => pickFile("mobile", file)}
              onRemove={
                form.mobileFile
                  ? () => set({ mobileFile: null })
                  : currentMobile
                    ? () => set({ removeMobile: true })
                    : null
              }
            />
            {mainIsVideo && (
              <FileSlot
                label="Video cover (optional)"
                help="Still image shown while the video loads, and on slow connections."
                accept={IMAGE_ACCEPT}
                previewUrl={previews.poster || currentPoster || null}
                previewIsVideo={false}
                onPick={(file) => pickFile("poster", file, { imageOnly: true })}
                onRemove={
                  form.posterFile
                    ? () => set({ posterFile: null })
                    : currentPoster
                      ? () => set({ removePoster: true })
                      : null
                }
              />
            )}
            <div>
              <label htmlFor="banner-alt" className="block font-label-bold text-label-bold text-on-surface mb-1">
                Describe the banner
              </label>
              <input
                id="banner-alt"
                maxLength={200}
                value={form.altText}
                onChange={(e) => set({ altText: e.target.value })}
                placeholder="e.g. Eid special - 20% off all mutton"
                className="w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-on-surface-variant mt-1">Read out by screen readers and shown if the image can't load.</p>
            </div>
          </div>
        )}

        {!isText && (previews.desktop || banner?.desktopUrl) && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="font-label-bold text-label-bold text-on-surface">How it will look</p>
              {hasFixedShape && (
                <div className="flex items-center gap-1" role="group" aria-label="Keep in view">
                  <span className="text-xs text-on-surface-variant mr-1">Keep in view:</span>
                  {FOCUS_POINTS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      title={f.label}
                      aria-pressed={form.focus === f.id}
                      onClick={() => set({ focus: f.id })}
                      className={`text-xs px-2 py-1 rounded border ${
                        form.focus === f.id
                          ? "border-primary bg-primary-fixed text-on-primary-fixed"
                          : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <BannerPreview
              desktopUrl={previews.desktop || banner?.desktopUrl}
              mobileUrl={previews.mobile || currentMobile || null}
              isVideo={mainIsVideo}
              layout={layout}
              focus={form.focus}
            />
            {!hasFixedShape && (
              <p className="text-xs text-on-surface-variant mt-1">
                This spot uses each picture's own shape. Set a fixed shape with the "Shape" button on the banners page.
              </p>
            )}
          </div>
        )}

        {/* Link */}
        <fieldset>
          <legend className="font-label-bold text-label-bold text-on-surface mb-2">When someone taps it</legend>
          <div className="flex flex-wrap gap-2 mb-2">
            {[
              { id: "none", label: "Nothing" },
              { id: "product", label: "Open a product" },
              { id: "category", label: "Open a category" },
              { id: "url", label: "Open a link" },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`text-sm px-3 py-1.5 rounded border cursor-pointer ${
                  form.linkType === opt.id
                    ? "border-primary bg-primary-fixed text-on-primary-fixed"
                    : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                <input
                  type="radio"
                  name="linkType"
                  value={opt.id}
                  checked={form.linkType === opt.id}
                  onChange={() => set({ linkType: opt.id, linkValue: "" })}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
          {form.linkType === "product" && (
            <select
              required
              aria-label="Product"
              value={form.linkValue}
              onChange={(e) => set({ linkValue: e.target.value })}
              className="w-full text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest"
            >
              <option value="">Choose a product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.category?.name})
                </option>
              ))}
            </select>
          )}
          {form.linkType === "category" && (
            <select
              required
              aria-label="Category"
              value={form.linkValue}
              onChange={(e) => set({ linkValue: e.target.value })}
              className="w-full text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest"
            >
              <option value="">Choose a category…</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {form.linkType === "url" && (
            <input
              required
              aria-label="Link"
              value={form.linkValue}
              onChange={(e) => set({ linkValue: e.target.value })}
              placeholder="/shop  or  https://wa.me/919205955696"
              className="w-full text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          )}
        </fieldset>

        {/* When */}
        <fieldset>
          <legend className="font-label-bold text-label-bold text-on-surface mb-1">Schedule (optional, India time)</legend>
          <p className="text-xs text-on-surface-variant mb-2">
            Leave empty to show it right away and keep it until you switch it off.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            <label className="text-sm text-on-surface-variant">
              Starts
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={(e) => set({ startsAt: e.target.value })}
                className="mt-1 w-full text-sm rounded border border-outline-variant px-3 py-2 text-on-surface"
              />
            </label>
            <label className="text-sm text-on-surface-variant">
              Ends
              <input
                type="datetime-local"
                value={form.endsAt}
                min={form.startsAt || undefined}
                onChange={(e) => set({ endsAt: e.target.value })}
                className="mt-1 w-full text-sm rounded border border-outline-variant px-3 py-2 text-on-surface"
              />
            </label>
          </div>
        </fieldset>

        <div className="flex items-center justify-end gap-3 pt-md border-t border-outline-variant">
          {progress !== null && (
            <span className="text-xs text-on-surface-variant mr-auto">
              {progress < 100 ? `Uploading ${progress}%` : "Processing…"}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {isSaving ? "Saving…" : isEdit ? "Save banner" : "Create banner"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FileSlot({ label, help, accept, required, previewUrl, previewIsVideo, onPick, onRemove }) {
  return (
    <div>
      <p className="font-label-bold text-label-bold text-on-surface mb-1">
        {label}
        {required && <span className="text-error"> *</span>}
      </p>
      <div className="rounded border-2 border-dashed border-outline-variant bg-surface-container-low overflow-hidden aspect-[16/7] flex items-center justify-center">
        {previewUrl ? (
          previewIsVideo ? (
            <video src={previewUrl} muted autoPlay loop playsInline className="w-full h-full object-contain bg-black" />
          ) : (
            <img src={previewUrl} alt="" className="w-full h-full object-contain" />
          )
        ) : (
          <span className="material-symbols-outlined text-3xl text-outline">add_photo_alternate</span>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <label className="flex-1 text-center text-sm px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low cursor-pointer">
          {previewUrl ? "Change" : "Choose file"}
          <input
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-sm px-3 py-1.5 rounded border border-outline-variant text-error hover:bg-error-container"
          >
            Remove
          </button>
        )}
      </div>
      <p className="text-xs text-on-surface-variant mt-1">{help}</p>
    </div>
  );
}
