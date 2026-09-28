import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchProducts,
  fetchProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  addVariant,
  updateVariant,
  deleteVariant,
  toggleVariantStock,
} from "../api/productsApi";
import { fetchCategories } from "../../categories/api/categoriesApi";
import { usePermission } from "../../../hooks/usePermission";
import { toggleProductStock } from "../api/productsApi";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import Modal from "../../../components/common/Modal";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";
import ProductImageGallery from "../components/ProductImageGallery";
import BestsellerSettingsModal from "../components/BestsellerSettingsModal";
import ComboCreateModal from "../components/ComboCreateModal";
import { rowsFromComboItems } from "../lib/combo";

const EMPTY_FORM = { id: null, name: "", categoryId: "", description: "", variants: [], images: [] };
const EMPTY_VARIANT_ROW = { label: "", price: "" };

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null);
  const [newVariant, setNewVariant] = useState(EMPTY_VARIANT_ROW);
  const [showBestseller, setShowBestseller] = useState(false);
  const [showNewCombo, setShowNewCombo] = useState(false);

  const { hasPermission } = usePermission();
  const canCreate = hasPermission("products:create");
  const canUpdate = hasPermission("products:update");
  const canDelete = hasPermission("products:delete");
  const canToggleStock = hasPermission("products:toggleStock");

  async function loadAll() {
    setIsLoading(true);
    setError(null);
    try {
      const [productsData, categoriesData] = await Promise.all([
        fetchProducts({
          categoryId: categoryFilter || undefined,
          search: debouncedSearch || undefined,
        }),
        fetchCategories(),
      ]);
      setProducts(productsData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load products.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, debouncedSearch]);

  function openCreateForm() {
    setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id || "" });
  }

  async function openEditForm(productId) {
    try {
      const product = await fetchProduct(productId);
      setForm({
        id: product.id,
        name: product.name,
        categoryId: product.categoryId,
        description: product.description || "",
        variants: product.variants,
        images: product.images || [],
      });
    } catch (err) {
      showError(err.response?.data?.message || "Failed to load product.");
    }
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    try {
      if (form.id) {
        await updateProduct(form.id, {
          name: form.name,
          categoryId: Number(form.categoryId),
          description: form.description,
        });
        await loadAll();
        openEditForm(form.id);
        showSuccess("Product updated.");
      } else {
        if (form.variants.length === 0) {
          setError("Add at least one variant (label + price) before saving.");
          return;
        }
        const created = await createProduct({
          name: form.name,
          categoryId: Number(form.categoryId),
          description: form.description,
          variants: form.variants.map((v) => ({ label: v.label, price: Number(v.price) })),
        });
        await loadAll();
        openEditForm(created.id);
        showSuccess("Product created. Now you can add its images.");
      }
      setError(null);
    } catch (err) {
      const message = err.response?.data?.message || "Save failed.";
      setError(message);
      showError(message);
    }
  }

  async function handleToggleProductStock(product, next) {
    try {
      await toggleProductStock(product.id, next);
      loadAll();
      showSuccess(next ? `${product.name} is available again.` : `${product.name} hidden from the shop.`);
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update availability.");
    }
  }

  async function handleDeleteProduct(product) {
    const confirmed = await showConfirm({
      title: `Delete "${product.name}"?`,
      text: "The product will be deactivated, not permanently removed.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;
    try {
      await deleteProduct(product.id);
      loadAll();
      showSuccess("Product deactivated.");
    } catch (err) {
      showError(err.response?.data?.message || "Delete failed.");
    }
  }

  function addVariantRowToNewProduct() {
    if (!newVariant.label || !newVariant.price) return;
    setForm({ ...form, variants: [...form.variants, newVariant] });
    setNewVariant(EMPTY_VARIANT_ROW);
  }

  function removeVariantRowFromNewProduct(index) {
    setForm({ ...form, variants: form.variants.filter((_, i) => i !== index) });
  }

  async function handleAddVariantToExisting() {
    if (!newVariant.label || !newVariant.price) return;
    try {
      await addVariant(form.id, { label: newVariant.label, price: Number(newVariant.price) });
      setNewVariant(EMPTY_VARIANT_ROW);
      openEditForm(form.id);
      showSuccess("Variant added.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to add variant.");
    }
  }

  async function handleUpdateExistingVariant(variantId, changes) {
    try {
      await updateVariant(variantId, changes);
      openEditForm(form.id);
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update variant.");
    }
  }

  async function handleDeleteExistingVariant(variantId) {
    const confirmed = await showConfirm({
      title: "Delete this variant?",
      text: "This cannot be undone.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;
    try {
      await deleteVariant(variantId);
      openEditForm(form.id);
      showSuccess("Variant deleted.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to delete variant.");
    }
  }

  /** Gallery changed inside the modal: refresh its images and the product grid behind it. */
  function handleGalleryChange(updated) {
    setForm((current) => (current ? { ...current, images: updated.images || [] } : current));
    loadAll();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Products</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            Manage your catalogue, pricing, and stock status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canUpdate && (
            <button
              type="button"
              onClick={() => setShowBestseller(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined text-lg">workspace_premium</span>
              Bestseller
            </button>
          )}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-lg text-on-surface-variant">
              search
            </span>
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products..."
              className="w-56 text-sm rounded border border-outline-variant pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm rounded border border-outline-variant px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowNewCombo(true)}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded border border-primary text-primary hover:bg-primary-fixed"
            >
              <span className="material-symbols-outlined text-lg">redeem</span>
              New combo
            </button>
          )}
          {canCreate && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-1 bg-primary-container text-on-primary text-sm px-4 py-2 rounded hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add Product
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-md rounded bg-error-container text-on-error-container text-sm px-3 py-2">{error}</div>
      )}

      <Modal
        isOpen={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Edit Product" : "Add New Product"}
        maxWidth="max-w-3xl"
      >
        {form && (
          <form onSubmit={handleSaveProduct}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-lg mb-lg">
              <div>
                <label className="block font-label-bold text-label-bold text-on-surface mb-2">Product Images</label>
                {form.id ? (
                  <ProductImageGallery
                    product={{ id: form.id, name: form.name, images: form.images }}
                    canUpdate={canUpdate}
                    onChange={handleGalleryChange}
                  />
                ) : (
                  <div className="aspect-square rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-low flex flex-col items-center justify-center text-center px-4">
                    <span className="material-symbols-outlined text-4xl text-outline mb-2">add_photo_alternate</span>
                    <p className="text-sm text-on-surface-variant">Save the product first, then add its images.</p>
                  </div>
                )}
              </div>

              <div className="space-y-md">
                <div>
                  <label className="block font-label-bold text-label-bold text-on-surface mb-1">Product Name</label>
                  <input
                    required
                    placeholder="e.g., Premium Lamb Chops"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded border border-outline-variant px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div>
                  <label className="block font-label-bold text-label-bold text-on-surface mb-1">Category</label>
                  <select
                    required
                    value={form.categoryId}
                    onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                    className="w-full rounded border border-outline-variant px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-label-bold text-label-bold text-on-surface mb-1">Description</label>
                  <textarea
                    rows={4}
                    placeholder="Enter product details..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full rounded border border-outline-variant px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            <hr className="border-outline-variant mb-lg" />

            <div className="flex items-center justify-between mb-3">
              <h3 className="font-headline-sm text-headline-sm text-on-surface">Variants &amp; Pricing</h3>
            </div>

            <div className="rounded-lg border border-outline-variant overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-on-surface">
                  <tr>
                    <th className="text-left px-4 py-2 font-label-bold text-label-bold">Variant Label</th>
                    <th className="text-left px-4 py-2 font-label-bold text-label-bold">Price</th>
                    <th className="text-left px-4 py-2 font-label-bold text-label-bold">In Stock</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.variants.map((v, index) =>
                    form.id ? (
                      <tr key={v.id} className="border-t border-outline-variant">
                        <td className="px-4 py-2">
                          <input
                            defaultValue={v.label}
                            onBlur={(e) => e.target.value !== v.label && handleUpdateExistingVariant(v.id, { label: e.target.value })}
                            className="w-full rounded border border-outline-variant px-2 py-1.5"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">₹</span>
                            <input
                              type="number"
                              defaultValue={v.price}
                              onBlur={(e) => Number(e.target.value) !== Number(v.price) && handleUpdateExistingVariant(v.id, { price: Number(e.target.value) })}
                              className="w-24 rounded border border-outline-variant pl-5 pr-2 py-1.5"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          {canToggleStock && (
                            <Toggle
                              checked={v.isInStock}
                              onChange={(next) => toggleVariantStock(v.id, next).then(() => openEditForm(form.id))}
                            />
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteExistingVariant(v.id)}
                              className="p-1 rounded text-error hover:bg-error-container"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      <tr key={index} className="border-t border-outline-variant">
                        <td className="px-4 py-2">{v.label}</td>
                        <td className="px-4 py-2">₹{v.price}</td>
                        <td className="px-4 py-2 text-on-surface-variant text-xs">In stock</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => removeVariantRowFromNewProduct(index)}
                            className="p-1 rounded text-error hover:bg-error-container"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-2 mb-lg">
              <input
                placeholder="Label (e.g. 500 GM)"
                value={newVariant.label}
                onChange={(e) => setNewVariant({ ...newVariant, label: e.target.value })}
                className="flex-1 rounded border border-outline-variant px-2 py-1.5 text-sm"
              />
              <input
                type="number"
                placeholder="Price"
                value={newVariant.price}
                onChange={(e) => setNewVariant({ ...newVariant, price: e.target.value })}
                className="w-28 rounded border border-outline-variant px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={form.id ? handleAddVariantToExisting : addVariantRowToNewProduct}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-outline-variant text-on-surface hover:bg-surface-container-low whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Add Variant
              </button>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="text-sm px-4 py-2 rounded border border-outline-variant text-on-surface-variant hover:bg-surface-container-low"
              >
                Cancel
              </button>
              <button type="submit" className="bg-primary-container text-on-primary text-sm px-5 py-2 rounded hover:opacity-90">
                Save Product
              </button>
            </div>
          </form>
        )}
      </Modal>

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {debouncedSearch ? `No products match "${debouncedSearch}".` : "No products yet."}
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-md">
          {products.map((p) => {
            const inStockCount = p.variants.filter((v) => v.isInStock).length;
            const comboRows = p.isCombo ? rowsFromComboItems(p.comboItems) : [];
            const comboProblem = comboRows.some((r) => r.problem);
            const anyOutOfStock = inStockCount < p.variants.length;
            return (
              <div
                key={p.id}
                className={`bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden group ${
                  p.isInStock ? "" : "opacity-60"
                }`}
              >
                <div className="aspect-square bg-surface-container-low flex items-center justify-center relative">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={p.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-4xl text-outline-variant">image</span>
                  )}
                  {p.images?.length > 1 && (
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-black/60 text-white text-[11px] font-semibold px-2 py-0.5">
                      <span className="material-symbols-outlined text-sm">photo_library</span>
                      {p.images.length}
                    </span>
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canUpdate && (
                      <button
                        onClick={() => openEditForm(p.id)}
                        className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-on-surface hover:bg-white"
                      >
                        <span className="material-symbols-outlined text-base">edit</span>
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDeleteProduct(p)}
                        className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center text-error hover:bg-white"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-3">
                  <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container mb-1">
                    {p.category?.name}
                  </span>
                  <Link
                    to={`/products/${p.id}`}
                    className="block font-medium text-on-surface leading-tight hover:text-primary"
                  >
                    {p.name}
                  </Link>
                  {p.isCombo && (
                    <p className={`text-xs mt-1 ${comboProblem ? "text-error font-semibold" : "text-on-surface-variant"}`}>
                      Combo · {comboRows.length} item{comboRows.length === 1 ? "" : "s"}
                      {comboProblem ? " · an item is unavailable (hidden)" : ""}
                    </p>
                  )}
                  <p className={`text-xs mt-1 ${anyOutOfStock ? "text-error" : "text-on-surface-variant"}`}>
                    {inStockCount}/{p.variants.length} variants in stock
                  </p>

                  {canToggleStock && (
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant">
                      <span className="text-xs text-on-surface-variant">Available today</span>
                      <Toggle
                        checked={p.isInStock}
                        showLabel={false}
                        onChange={(next) => handleToggleProductStock(p, next)}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ComboCreateModal isOpen={showNewCombo} categories={categories} onClose={() => { setShowNewCombo(false); loadAll(); }} />
      <BestsellerSettingsModal isOpen={showBestseller} products={products} onClose={() => setShowBestseller(false)} />
    </div>
  );
}
