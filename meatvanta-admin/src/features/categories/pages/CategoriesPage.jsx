import { useEffect, useState } from "react";
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
  removeCategoryImage,
} from "../api/categoriesApi";
import { usePermission } from "../../../hooks/usePermission";
import Modal from "../../../components/common/Modal";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";

const EMPTY_FORM = {
  id: null,
  name: "",
  sortOrder: 0,
  isActive: true,
  // Photos: the saved URL, a newly chosen file (not uploaded until Save), or a removal.
  images: {
    desktop: { url: null, file: null, remove: false },
    mobile: { url: null, file: null, remove: false },
  },
};

function formFromCategory(cat) {
  return {
    id: cat.id,
    name: cat.name,
    sortOrder: cat.sortOrder,
    isActive: cat.isActive,
    images: {
      desktop: { url: cat.imageUrl || null, file: null, remove: false },
      mobile: { url: cat.mobileImageUrl || null, file: null, remove: false },
    },
  };
}

/** One photo slot: preview, choose/replace, remove. Nothing is uploaded until Save. */
function ImageSlot({ label, hint, value, onChange, disabled }) {
  const preview = value.file ? URL.createObjectURL(value.file) : value.remove ? null : value.url;
  return (
    <div>
      <p className="font-label-bold text-label-bold text-on-surface mb-1">{label}</p>
      <div className="aspect-[4/3] rounded border border-dashed border-outline-variant bg-surface-container-low flex items-center justify-center overflow-hidden">
        {preview ? (
          <img src={preview} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-3xl text-outline-variant">image</span>
        )}
      </div>
      <p className="text-[11px] text-on-surface-variant mt-1">{hint}</p>
      {!disabled && (
        <div className="flex items-center gap-2 mt-1.5">
          <label className="text-xs px-2.5 py-1 rounded border border-outline-variant text-on-surface cursor-pointer hover:bg-surface-container-low">
            {preview ? "Replace" : "Choose photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onChange({ ...value, file, remove: false });
                e.target.value = "";
              }}
            />
          </label>
          {preview && (
            <button
              type="button"
              onClick={() => onChange({ ...value, file: null, remove: !!value.url })}
              className="text-xs text-error hover:underline"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const { hasPermission } = usePermission();

  const canCreate = hasPermission("categories:create");
  const canUpdate = hasPermission("categories:update");
  const canDelete = hasPermission("categories:delete");

  async function loadCategories() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCategories(true);
      setCategories(data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load categories.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    try {
      let categoryId = form.id;
      if (form.id) {
        await updateCategory(form.id, { name: form.name, sortOrder: Number(form.sortOrder), isActive: form.isActive });
      } else {
        const created = await createCategory({ name: form.name, sortOrder: Number(form.sortOrder) });
        categoryId = created.id;
      }
      // Photos are saved after the category itself, one slot at a time.
      if (canUpdate) {
        for (const slot of ["desktop", "mobile"]) {
          const img = form.images[slot];
          if (img.file) await uploadCategoryImage(categoryId, slot, img.file);
          else if (img.remove) await removeCategoryImage(categoryId, slot);
        }
      }
      setForm(null);
      setError(null);
      loadCategories();
      showSuccess(form.id ? "Category updated." : "Category created.");
    } catch (err) {
      const message = err.response?.data?.message || "Save failed.";
      setError(message);
      showError(message);
    }
  }

  async function handleDelete(category) {
    const confirmed = await showConfirm({
      title: `Delete "${category.name}"?`,
      text: "If products still reference this category, it will be deactivated instead of deleted.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;
    try {
      await deleteCategory(category.id);
      loadCategories();
      showSuccess("Category deleted.");
    } catch (err) {
      const message = err.response?.data?.message || "Delete failed.";
      setError(message);
      showError(message);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <h1 className="font-headline-md text-headline-md text-on-surface">Categories</h1>
        {canCreate && (
          <button
            onClick={() => setForm(EMPTY_FORM)}
            className="flex items-center gap-1 bg-primary-container text-on-primary text-sm px-4 py-2 rounded hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            Add Category
          </button>
        )}
      </div>

      {error && (
        <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>
      )}

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit Category" : "New Category"} maxWidth="max-w-xl">
        {form && (
          <form onSubmit={handleSave}>
            <label className="block font-label-bold text-label-bold text-on-surface mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full mb-3 rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            <label className="block font-label-bold text-label-bold text-on-surface mb-1">Sort Order</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              className="w-full mb-3 rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {canUpdate && (
              <div className="mb-4">
                <p className="text-xs text-on-surface-variant mb-2">
                  Photo for the home page card. The category name and a "Shop Now" button are added automatically.
                  Without a photo the card is a plain red card.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <ImageSlot
                    label="Main photo"
                    hint="Landscape works best. Shown on laptop and tablet."
                    value={form.images.desktop}
                    onChange={(v) => setForm({ ...form, images: { ...form.images, desktop: v } })}
                  />
                  <ImageSlot
                    label="Phone photo (optional)"
                    hint="If empty, the main photo is used on phones."
                    value={form.images.mobile}
                    onChange={(v) => setForm({ ...form, images: { ...form.images, mobile: v } })}
                  />
                </div>
              </div>
            )}

            {form.id && (
              <label className="flex items-center gap-2 mb-4 text-sm text-on-surface">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button type="submit" className="bg-primary-container text-on-primary text-sm px-5 py-2 rounded hover:opacity-90">
                Save
              </button>
            </div>
          </form>
        )}
      </Modal>

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      ) : categories.length === 0 ? (
        <p className="text-sm text-on-surface-variant">No categories yet.</p>
      ) : (
        <>
          <div className="hidden md:block bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-on-surface">
                <tr>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold w-16">Photo</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Name</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Slug</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Products</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Status</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Sort</th>
                  <th className="text-right px-4 py-2 font-label-bold text-label-bold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-t border-outline-variant">
                    <td className="px-4 py-2">
                      {cat.imageUrl ? (
                        <img src={cat.imageUrl} alt="" className="w-12 h-9 rounded object-cover" />
                      ) : (
                        <span className="inline-flex w-12 h-9 rounded bg-surface-container-low items-center justify-center text-outline-variant">
                          <span className="material-symbols-outlined text-lg">image</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-on-surface">{cat.name}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{cat.slug}</td>
                    <td className="px-4 py-3 text-on-surface-variant">{cat._count?.products ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          cat.isActive ? "bg-secondary-fixed text-on-secondary-fixed-variant" : "bg-surface-container text-on-surface-variant"
                        }`}
                      >
                        {cat.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{cat.sortOrder}</td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {canUpdate && (
                        <button
                          onClick={() => setForm(formFromCategory(cat))}
                          className="p-1.5 rounded text-primary hover:bg-surface-container-low"
                          title="Edit"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(cat)}
                          className="p-1.5 rounded text-error hover:bg-surface-container-low"
                          title="Delete"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {categories.map((cat) => (
              <div key={cat.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-on-surface">{cat.name}</p>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      cat.isActive ? "bg-secondary-fixed text-on-secondary-fixed-variant" : "bg-surface-container text-on-surface-variant"
                    }`}
                  >
                    {cat.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">{cat.slug} · {cat._count?.products ?? 0} products</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] uppercase tracking-wide text-on-surface-variant bg-surface-container-low px-2 py-0.5 rounded-full">
                    Sort: {cat.sortOrder}
                  </span>
                </div>
                <div className="mt-3 flex gap-3 text-sm">
                  {canUpdate && (
                    <button
                      onClick={() => setForm(formFromCategory(cat))}
                      className="text-primary"
                    >
                      Edit
                    </button>
                  )}
                  {canDelete && (
                    <button onClick={() => handleDelete(cat)} className="text-error">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
