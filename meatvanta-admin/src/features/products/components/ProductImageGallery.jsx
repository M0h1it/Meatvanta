import { useRef, useState } from "react";
import { uploadProductImages, reorderProductImages, deleteProductImage } from "../api/productsApi";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

// Keep in sync with the backend limits (products.service / upload.middleware).
const MAX_IMAGES = 8;
const MAX_PER_UPLOAD = 6;
const MAX_FILE_MB = 10;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * Product photo gallery: upload several images, reorder them, pick the cover,
 * delete. The first image is the cover the shop shows in listings and the cart.
 *
 * Props:
 *  - product   { id, name, images: [{ id, url, sortOrder }] }
 *  - canUpdate whether the admin may change images
 *  - onChange  called with the updated product after every successful change
 */
export default function ProductImageGallery({ product, canUpdate, onChange }) {
  const images = product.images || [];
  const fileInputRef = useRef(null);
  const [isBusy, setIsBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const remaining = MAX_IMAGES - images.length;
  const canAddMore = canUpdate && remaining > 0 && !isBusy;
  const cover = images[0];

  /** Checks files before sending, so the admin gets a clear message instantly. */
  function validateFiles(files) {
    if (files.length === 0) return "No images selected.";
    if (files.length > remaining) {
      return remaining === 0
        ? `This product already has ${MAX_IMAGES} images. Delete one first.`
        : `You can add ${remaining} more image${remaining === 1 ? "" : "s"} (max ${MAX_IMAGES} per product).`;
    }
    if (files.length > MAX_PER_UPLOAD) return `Upload up to ${MAX_PER_UPLOAD} images at a time.`;
    const badType = files.find((f) => !ALLOWED_TYPES.includes(f.type));
    if (badType) return `"${badType.name}" is not a JPG, PNG or WEBP image.`;
    const tooBig = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (tooBig) return `"${tooBig.name}" is larger than ${MAX_FILE_MB} MB.`;
    return null;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (files.length === 0) return;

    const problem = validateFiles(files);
    if (problem) {
      showError(problem);
      return;
    }

    setIsBusy(true);
    setUploadProgress(0);
    try {
      const updated = await uploadProductImages(product.id, files, setUploadProgress);
      onChange(updated);
      showSuccess(files.length === 1 ? "Image uploaded." : `${files.length} images uploaded.`);
    } catch (err) {
      showError(err.response?.data?.message || "Image upload failed.");
    } finally {
      setIsBusy(false);
      setUploadProgress(null);
    }
  }

  async function saveOrder(nextImages, message) {
    setIsBusy(true);
    try {
      const updated = await reorderProductImages(
        product.id,
        nextImages.map((img) => img.id)
      );
      onChange(updated);
      if (message) showSuccess(message);
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save the new order.");
    } finally {
      setIsBusy(false);
    }
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    saveOrder(next, target === 0 || index === 0 ? "Cover image updated." : null);
  }

  function makeCover(index) {
    if (index === 0) return;
    const next = [images[index], ...images.filter((_, i) => i !== index)];
    saveOrder(next, "Cover image updated.");
  }

  async function handleDelete(image, index) {
    const confirmed = await showConfirm({
      title: "Delete this image?",
      text:
        index === 0 && images.length > 1
          ? "This is the cover. The next image will become the cover."
          : "It will be removed from the shop straight away.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;

    setIsBusy(true);
    try {
      const updated = await deleteProductImage(image.id);
      onChange(updated);
      showSuccess("Image removed.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to remove image.");
    } finally {
      setIsBusy(false);
    }
  }

  function onDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    if (!canAddMore) return;
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div>
      {/* Cover preview */}
      <div className="relative aspect-square rounded-lg border border-outline-variant bg-surface-container-low flex items-center justify-center overflow-hidden mb-3">
        {cover ? (
          <>
            <img src={cover.url} alt={`${product.name} - cover`} className="w-full h-full object-cover" />
            <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-primary-container text-on-primary text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 shadow">
              <span className="material-symbols-outlined text-sm">star</span>
              Cover
            </span>
          </>
        ) : (
          <div className="text-center px-4">
            <span className="material-symbols-outlined text-4xl text-outline">image</span>
            <p className="text-sm text-on-surface-variant mt-1">No images yet</p>
          </div>
        )}
      </div>

      {/* Thumbnails + add tile */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {images.map((image, index) => (
          <div
            key={image.id}
            className={`group relative aspect-square rounded-md overflow-hidden border-2 ${
              index === 0 ? "border-primary" : "border-outline-variant"
            }`}
          >
            <img src={image.url} alt={`${product.name} - image ${index + 1}`} className="w-full h-full object-cover" />
            <span className="absolute top-1 left-1 min-w-5 h-5 px-1 rounded bg-black/60 text-white text-[10px] font-bold flex items-center justify-center">
              {index + 1}
            </span>

            {canUpdate && (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/55 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                <IconButton
                  icon="chevron_left"
                  label="Move left"
                  disabled={isBusy || index === 0}
                  onClick={() => move(index, -1)}
                />
                {index !== 0 && (
                  <IconButton icon="star" label="Make cover" disabled={isBusy} onClick={() => makeCover(index)} />
                )}
                <IconButton
                  icon="delete"
                  label="Delete image"
                  disabled={isBusy}
                  onClick={() => handleDelete(image, index)}
                />
                <IconButton
                  icon="chevron_right"
                  label="Move right"
                  disabled={isBusy || index === images.length - 1}
                  onClick={() => move(index, 1)}
                />
              </div>
            )}
          </div>
        ))}

        {canUpdate && remaining > 0 && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              if (canAddMore) setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            disabled={!canAddMore}
            className={`aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              isDragging
                ? "border-primary bg-primary-fixed"
                : "border-outline-variant bg-surface-container-low hover:bg-surface-container"
            }`}
          >
            {uploadProgress !== null ? (
              <>
                <span className="material-symbols-outlined text-xl text-primary animate-spin">progress_activity</span>
                <span className="text-[11px] font-semibold text-on-surface-variant mt-1">
                  {uploadProgress < 100 ? `${uploadProgress}%` : "Processing"}
                </span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-xl text-on-surface-variant">add_photo_alternate</span>
                <span className="text-[11px] font-semibold text-on-surface-variant mt-1 leading-tight">Add</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_TYPES.join(",")}
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
      />

      <p className="text-xs text-on-surface-variant mt-2 leading-relaxed">
        {images.length}/{MAX_IMAGES} images · JPG, PNG or WEBP up to {MAX_FILE_MB} MB. Images are resized and
        compressed automatically. The first image is the cover shown in the shop.
      </p>
    </div>
  );
}

function IconButton({ icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex-1 h-7 flex items-center justify-center text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span className="material-symbols-outlined text-base">{icon}</span>
    </button>
  );
}
