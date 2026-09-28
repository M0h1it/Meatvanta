import { useEffect, useState, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  fetchProduct,
  updateProduct,
  toggleProductStock,
  addVariant,
  updateVariant,
  deleteVariant,
  toggleVariantStock,
  addOptionGroup,
  updateOptionGroup,
  deleteOptionGroup,
  addOption,
  updateOption,
  deleteOption,
} from "../api/productsApi";
import { fetchCategories } from "../../categories/api/categoriesApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";
import ProductImageGallery from "../components/ProductImageGallery";
import ProductTagsEditor from "../components/ProductTagsEditor";
import ComboContentsSection from "../components/ComboContentsSection";

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Inline "add" rows
  const [newVariant, setNewVariant] = useState({ label: "", price: "", mrp: "" });
  const [newGroup, setNewGroup] = useState({ name: "", isRequired: false, allowMultiple: false });
  const [newOptionByGroup, setNewOptionByGroup] = useState({});

  const { hasPermission } = usePermission();
  const canUpdate = hasPermission("products:update");
  const canDelete = hasPermission("products:delete");
  const canToggleStock = hasPermission("products:toggleStock");

  const load = useCallback(async () => {
    try {
      setProduct(await fetchProduct(Number(id)));
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load this product.");
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    fetchCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [load]);

  function run(action, successMessage) {
    return async (...args) => {
      try {
        await action(...args);
        await load();
        if (successMessage) showSuccess(successMessage);
      } catch (err) {
        showError(err.response?.data?.message || "Something went wrong.");
      }
    };
  }

  const handleToggleProductStock = run(
    (next) => toggleProductStock(product.id, next),
    null // message differs by direction, handled below
  );

  async function handleProductStock(next) {
    try {
      await toggleProductStock(product.id, next);
      await load();
      showSuccess(next ? "Product is available again." : "Product hidden from the shop.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to update availability.");
    }
  }

  const handleFieldSave = run(
    (field, value) => updateProduct(product.id, { [field]: value }),
    "Product updated."
  );

  async function handleAddVariant() {
    if (!newVariant.label || !newVariant.price) return;
    try {
      await addVariant(product.id, {
        label: newVariant.label,
        price: Number(newVariant.price),
        mrp: newVariant.mrp === "" ? null : Number(newVariant.mrp),
      });
      setNewVariant({ label: "", price: "", mrp: "" });
      await load();
      showSuccess("Variant added.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to add variant.");
    }
  }

  async function handleDeleteVariant(variantId) {
    const confirmed = await showConfirm({
      title: "Delete this variant?",
      text: "This cannot be undone.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;
    try {
      await deleteVariant(variantId);
      await load();
      showSuccess("Variant deleted.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to delete variant.");
    }
  }

  async function handleAddGroup() {
    if (!newGroup.name.trim()) return;
    try {
      await addOptionGroup(product.id, newGroup);
      setNewGroup({ name: "", isRequired: false, allowMultiple: false });
      await load();
      showSuccess("Option group added.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to add group.");
    }
  }

  async function handleDeleteGroup(group) {
    const confirmed = await showConfirm({
      title: `Delete "${group.name}"?`,
      text: "All options inside it will be removed. Past orders keep their record.",
      confirmButtonText: "Delete",
    });
    if (!confirmed) return;
    try {
      await deleteOptionGroup(group.id);
      await load();
      showSuccess("Option group removed.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to delete group.");
    }
  }

  async function handleAddOption(groupId) {
    const draft = newOptionByGroup[groupId];
    if (!draft?.name) return;
    try {
      await addOption(groupId, { name: draft.name, extraPrice: Number(draft.extraPrice || 0) });
      setNewOptionByGroup((s) => ({ ...s, [groupId]: { name: "", extraPrice: "" } }));
      await load();
      showSuccess("Option added.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to add option.");
    }
  }

  async function handleDeleteOption(optionId) {
    try {
      await deleteOption(optionId);
      await load();
      showSuccess("Option removed.");
    } catch (err) {
      showError(err.response?.data?.message || "Failed to remove option.");
    }
  }

  if (isLoading) return <p className="text-sm text-on-surface-variant">Loading product...</p>;

  if (error || !product) {
    return (
      <div>
        <p className="text-on-surface font-semibold mb-2">{error || "Product not found."}</p>
        <Link to="/products" className="text-primary underline text-sm">
          Back to products
        </Link>
      </div>
    );
  }

  const inStockVariants = product.variants.filter((v) => v.isInStock).length;

  return (
    <div>
      <button
        onClick={() => navigate("/products")}
        className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary mb-3"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        All Products
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">
            {product.name}
            {product.isCombo && (
              <span className="ml-2 align-middle text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-surface">
                Combo
              </span>
            )}
          </h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {product.category?.name} · {product.variants.length} variants ({inStockVariants} available)
            {!product.isActive && " · deactivated"}
          </p>
        </div>

        {canToggleStock && (
          <div className="bg-surface-container-lowest rounded-lg border border-outline-variant px-md py-sm">
            <p className="text-xs text-on-surface-variant mb-1">Available today</p>
            <Toggle checked={product.isInStock} onChange={handleProductStock} />
          </div>
        )}
      </div>

      {!product.isInStock && (
        <div className="mb-lg rounded-lg bg-error-container text-on-error-container text-sm px-md py-sm">
          This product is hidden from the shop. Customers can't see or order it until you switch it back on.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-md">
          {/* Basics */}
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Details</h2>

            <label className="block font-label-bold text-label-bold text-on-surface mb-1">Name</label>
            <input
              defaultValue={product.name}
              disabled={!canUpdate}
              onBlur={(e) => e.target.value !== product.name && handleFieldSave("name", e.target.value)}
              className="w-full mb-3 rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />

            <label className="block font-label-bold text-label-bold text-on-surface mb-1">Category</label>
            <select
              defaultValue={product.categoryId}
              disabled={!canUpdate}
              onChange={(e) => handleFieldSave("categoryId", Number(e.target.value))}
              className="w-full mb-3 rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <label className="block font-label-bold text-label-bold text-on-surface mb-1">Description</label>
            <textarea
              rows={3}
              defaultValue={product.description || ""}
              disabled={!canUpdate}
              onBlur={(e) =>
                e.target.value !== (product.description || "") &&
                handleFieldSave("description", e.target.value)
              }
              className="w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
            />
            <p className="text-xs text-on-surface-variant mt-1">Changes save when you click away.</p>
          </section>

          {product.isCombo && <ComboContentsSection product={product} canUpdate={canUpdate} onSaved={load} />}

          {/* Variants */}
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">
              {product.isCombo ? "Combo price" : "Variants & Pricing"}
            </h2>
            <p className="text-xs text-on-surface-variant mb-3">
              How much the customer buys — 250 GM, 1 KG, 4 Pieces. MRP is optional: when it is higher than the price,
              the shop shows it struck through with "% OFF". Use only a real MRP.
            </p>

            <div className="rounded border border-outline-variant overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead className="bg-surface-container-low text-on-surface">
                  <tr>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Label</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Price</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">MRP</th>
                    <th className="text-left px-3 py-2 font-label-bold text-label-bold">Available</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.id} className="border-t border-outline-variant">
                      <td className="px-3 py-2">
                        <input
                          defaultValue={v.label}
                          disabled={!canUpdate}
                          onBlur={(e) =>
                            e.target.value !== v.label &&
                            run(() => updateVariant(v.id, { label: e.target.value }))()
                          }
                          className="w-full rounded border border-outline-variant px-2 py-1.5 disabled:opacity-60"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">₹</span>
                          <input
                            type="number"
                            defaultValue={v.price}
                            disabled={!canUpdate}
                            onBlur={(e) =>
                              Number(e.target.value) !== Number(v.price) &&
                              run(() => updateVariant(v.id, { price: Number(e.target.value) }))()
                            }
                            className="w-full rounded border border-outline-variant pl-5 pr-2 py-1.5 disabled:opacity-60"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative w-28">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">₹</span>
                          <input
                            // key resets the box to the saved value after every reload
                            key={`${v.id}-${v.mrp ?? ""}`}
                            type="number"
                            placeholder="—"
                            aria-label={`MRP for ${v.label}`}
                            defaultValue={v.mrp ?? ""}
                            disabled={!canUpdate}
                            onBlur={(e) => {
                              const next = e.target.value === "" ? null : Number(e.target.value);
                              const current = v.mrp === null || v.mrp === undefined ? null : Number(v.mrp);
                              if (next !== current) run(() => updateVariant(v.id, { mrp: next }))();
                            }}
                            className="w-full rounded border border-outline-variant pl-5 pr-2 py-1.5 disabled:opacity-60"
                          />
                        </div>
                        {v.mrp && Number(v.mrp) > Number(v.price) && (
                          <span className="text-[11px] text-on-secondary-fixed-variant font-semibold">
                            {Math.round(((Number(v.mrp) - Number(v.price)) / Number(v.mrp)) * 100)}% OFF shown
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {canToggleStock && (
                          <Toggle
                            checked={v.isInStock}
                            onChange={(next) => run(() => toggleVariantStock(v.id, next))()}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteVariant(v.id)}
                            className="p-1 rounded text-error hover:bg-error-container"
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

            {canUpdate && (
              <div className="flex items-center gap-2">
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
                <input
                  type="number"
                  placeholder="MRP (optional)"
                  value={newVariant.mrp}
                  onChange={(e) => setNewVariant({ ...newVariant, mrp: e.target.value })}
                  className="w-32 rounded border border-outline-variant px-2 py-1.5 text-sm"
                />
                <button
                  onClick={handleAddVariant}
                  className="flex items-center gap-1 text-sm px-3 py-1.5 rounded border border-outline-variant hover:bg-surface-container-low whitespace-nowrap"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  Add
                </button>
              </div>
            )}
          </section>

          {/* Option groups - combos come as listed, so they have none */}
          {product.isCombo ? null : (
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Options</h2>
            <p className="text-xs text-on-surface-variant mb-3">
              How it's prepared — marination, cut style. Each option adds its price on top of the variant.
            </p>

            {product.optionGroups?.length === 0 && (
              <p className="text-sm text-on-surface-variant mb-3">
                No options yet. Add a group like "Marination Style", then its choices.
              </p>
            )}

            <div className="space-y-3 mb-4">
              {product.optionGroups?.map((group) => (
                <div key={group.id} className="rounded border border-outline-variant p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="font-medium text-on-surface text-sm">{group.name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {group.isRequired ? "Required" : "Optional"} ·{" "}
                        {group.allowMultiple ? "Pick many" : "Pick one"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {canUpdate && (
                        <>
                          <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <input
                              type="checkbox"
                              checked={group.isRequired}
                              onChange={(e) =>
                                run(() => updateOptionGroup(group.id, { isRequired: e.target.checked }))()
                              }
                            />
                            Required
                          </label>
                          <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                            <input
                              type="checkbox"
                              checked={group.allowMultiple}
                              onChange={(e) =>
                                run(() => updateOptionGroup(group.id, { allowMultiple: e.target.checked }))()
                              }
                            />
                            Multi-select
                          </label>
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDeleteGroup(group)}
                          className="p-1 rounded text-error hover:bg-error-container"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-2">
                    {group.options?.map((option) => (
                      <div key={option.id} className="flex items-center gap-2 text-sm">
                        <input
                          defaultValue={option.name}
                          disabled={!canUpdate}
                          onBlur={(e) =>
                            e.target.value !== option.name &&
                            run(() => updateOption(option.id, { name: e.target.value }))()
                          }
                          className="flex-1 rounded border border-outline-variant px-2 py-1.5 disabled:opacity-60"
                        />
                        <div className="relative w-24">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant text-xs">+₹</span>
                          <input
                            type="number"
                            defaultValue={option.extraPrice}
                            disabled={!canUpdate}
                            onBlur={(e) =>
                              Number(e.target.value) !== Number(option.extraPrice) &&
                              run(() => updateOption(option.id, { extraPrice: Number(e.target.value) }))()
                            }
                            className="w-full rounded border border-outline-variant pl-7 pr-2 py-1.5 disabled:opacity-60"
                          />
                        </div>
                        {canUpdate && (
                          <Toggle
                            checked={option.isAvailable}
                            showLabel={false}
                            onChange={(next) =>
                              run(() => updateOption(option.id, { isAvailable: next }))()
                            }
                          />
                        )}
                        {canDelete && (
                          <button
                            onClick={() => handleDeleteOption(option.id)}
                            className="p-1 rounded text-error hover:bg-error-container"
                          >
                            <span className="material-symbols-outlined text-lg">close</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {canUpdate && (
                    <div className="flex items-center gap-2">
                      <input
                        placeholder="Option (e.g. Tandoori)"
                        value={newOptionByGroup[group.id]?.name || ""}
                        onChange={(e) =>
                          setNewOptionByGroup((s) => ({
                            ...s,
                            [group.id]: { ...s[group.id], name: e.target.value },
                          }))
                        }
                        className="flex-1 rounded border border-outline-variant px-2 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        placeholder="+₹"
                        value={newOptionByGroup[group.id]?.extraPrice || ""}
                        onChange={(e) =>
                          setNewOptionByGroup((s) => ({
                            ...s,
                            [group.id]: { ...s[group.id], extraPrice: e.target.value },
                          }))
                        }
                        className="w-24 rounded border border-outline-variant px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleAddOption(group.id)}
                        className="text-sm px-3 py-1.5 rounded border border-outline-variant hover:bg-surface-container-low whitespace-nowrap"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canUpdate && (
              <div className="pt-3 border-t border-outline-variant">
                <p className="font-label-bold text-label-bold text-on-surface mb-2">New option group</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    placeholder="Group name (e.g. Marination Style)"
                    value={newGroup.name}
                    onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                    className="flex-1 min-w-[180px] rounded border border-outline-variant px-2 py-1.5 text-sm"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={newGroup.isRequired}
                      onChange={(e) => setNewGroup({ ...newGroup, isRequired: e.target.checked })}
                    />
                    Required
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                    <input
                      type="checkbox"
                      checked={newGroup.allowMultiple}
                      onChange={(e) => setNewGroup({ ...newGroup, allowMultiple: e.target.checked })}
                    />
                    Multi-select
                  </label>
                  <button
                    onClick={handleAddGroup}
                    className="text-sm px-4 py-1.5 rounded bg-primary-container text-on-primary hover:opacity-90"
                  >
                    Add Group
                  </button>
                </div>
              </div>
            )}
          </section>
          )}
        </div>

        {/* Right column: image gallery */}
        <div>
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Images</h2>
            <ProductImageGallery product={product} canUpdate={canUpdate} onChange={setProduct} />
          </section>
          <div className="mt-md">
            <ProductTagsEditor product={product} canUpdate={canUpdate} onChange={load} />
          </div>
        </div>
      </div>
    </div>
  );
}
