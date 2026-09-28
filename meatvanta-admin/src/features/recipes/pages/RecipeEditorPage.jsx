import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { fetchRecipe, saveRecipe, uploadRecipeImages } from "../api/recipesApi";
import { fetchProducts } from "../../products/api/productsApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Toggle from "../../../components/common/Toggle";
import FlameIcon from "../components/FlameIcon";
import { DIFFICULTIES, SPICE_LEVELS, FLAMES, UNIT_SUGGESTIONS, totalTime } from "../lib/recipeOptions";

// Editor rows need a stable key before they have a database id.
let keySeq = 0;
const newKey = () => `k${(keySeq += 1)}`;

function toForm(recipe) {
  return {
    title: recipe.title,
    intro: recipe.intro || "",
    prepMinutes: recipe.prepMinutes ?? "",
    cookMinutes: recipe.cookMinutes ?? "",
    serves: recipe.serves ?? "",
    difficulty: recipe.difficulty,
    spiceLevel: recipe.spiceLevel,
    videoUrl: recipe.videoUrl || "",
    isPublished: recipe.isPublished,
    images: recipe.images.map((i) => ({ path: i.path, url: i.url })),
    ingredients: recipe.ingredients.map((i) => ({
      key: newKey(),
      quantity: i.quantity || "",
      unit: i.unit || "",
      name: i.name,
      note: i.note || "",
      productId: i.productId || "",
    })),
    steps: recipe.steps.map((s) => ({
      key: newKey(),
      text: s.text,
      flame: s.flame,
      minutes: s.minutes ?? "",
      tip: s.tip || "",
      imagePath: s.imagePath || null,
      imageUrl: s.imageUrl || null,
    })),
  };
}

function toPayload(form) {
  const num = (v) => (v === "" || v === null ? null : Number(v));
  return {
    title: form.title,
    intro: form.intro,
    prepMinutes: num(form.prepMinutes),
    cookMinutes: num(form.cookMinutes),
    serves: num(form.serves),
    difficulty: form.difficulty,
    spiceLevel: form.spiceLevel,
    videoUrl: form.videoUrl.trim() || null,
    isPublished: form.isPublished,
    images: form.images.map((i) => ({ path: i.path })),
    ingredients: form.ingredients
      .filter((i) => i.name.trim())
      .map(({ quantity, unit, name, note, productId }) => ({ quantity, unit, name, note, productId: productId ? Number(productId) : null })),
    steps: form.steps
      .filter((s) => s.text.trim())
      .map(({ text, flame, minutes, tip, imagePath }) => ({ text, flame, minutes: num(minutes), tip, imagePath })),
  };
}

function moveItem(list, index, dir) {
  const target = index + dir;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function RecipeEditorPage() {
  const { id } = useParams();
  const recipeId = Number(id);
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canUpdate = hasPermission("recipes:update");

  const [form, setForm] = useState(null);
  const [savedJson, setSavedJson] = useState("");
  const [products, setProducts] = useState([]);
  const [error, setError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [uploading, setUploading] = useState(null); // "gallery" | step key | null
  const galleryInput = useRef(null);

  const load = useCallback(async () => {
    try {
      const recipe = await fetchRecipe(recipeId);
      const f = toForm(recipe);
      setForm(f);
      setSavedJson(JSON.stringify(toPayload(f)));
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load this recipe.");
    }
  }, [recipeId]);

  useEffect(() => {
    load();
    fetchProducts({ includeInactive: false })
      .then(setProducts)
      .catch(() => setProducts([]));
  }, [load]);

  const isDirty = useMemo(() => form && JSON.stringify(toPayload(form)) !== savedJson, [form, savedJson]);

  // Warn before closing the tab with unsaved work.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  if (error) return <p className="text-on-surface font-semibold">{error}</p>;
  if (!form) return <p className="text-sm text-on-surface-variant">Loading recipe…</p>;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setIngredient = (index, patch) => set({ ingredients: form.ingredients.map((x, i) => (i === index ? { ...x, ...patch } : x)) });
  const setStep = (index, patch) => set({ steps: form.steps.map((x, i) => (i === index ? { ...x, ...patch } : x)) });

  async function upload(files, target) {
    if (!files || files.length === 0) return;
    setUploading(target);
    try {
      const images = await uploadRecipeImages(recipeId, files);
      if (target === "gallery") {
        setForm((f) => ({ ...f, images: [...f.images, ...images].slice(0, 10) }));
      } else {
        setForm((f) => ({ ...f, steps: f.steps.map((s) => (s.key === target ? { ...s, imagePath: images[0].path, imageUrl: images[0].url } : s)) }));
      }
    } catch (err) {
      showError(err.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(null);
    }
  }

  async function save(publishOverride) {
    const next = publishOverride === undefined ? form : { ...form, isPublished: publishOverride };
    setIsSaving(true);
    try {
      const recipe = await saveRecipe(recipeId, toPayload(next));
      const f = toForm(recipe);
      setForm(f);
      setSavedJson(JSON.stringify(toPayload(f)));
      showSuccess(recipe.isPublished ? "Saved - live on the site." : "Saved as draft.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't save the recipe.");
    } finally {
      setIsSaving(false);
    }
  }

  async function goBack() {
    if (isDirty) {
      const ok = await showConfirm({ title: "Leave without saving?", text: "Your changes will be lost.", confirmButtonText: "Leave" });
      if (!ok) return;
    }
    navigate("/recipes");
  }

  const input = "w-full rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";
  const small = "rounded border border-outline-variant px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60";
  const chip = (active) =>
    `text-sm px-3 py-1.5 rounded-full border ${active ? "border-primary bg-primary-fixed text-primary font-semibold" : "border-outline-variant text-on-surface-variant hover:bg-surface-container-low"}`;
  const disabled = !canUpdate;

  return (
    <div className="pb-24">
      <button onClick={goBack} className="inline-flex items-center gap-1 text-sm font-semibold text-on-surface-variant hover:text-primary mb-3">
        <span className="material-symbols-outlined text-base">chevron_left</span>
        All Recipes
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">{form.title || "Untitled recipe"}</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {form.isPublished ? "Live on the site" : "Draft - not on the site"}
            {totalTime(form) ? ` · ${totalTime(form)} total` : ""}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-md">
        <div className="lg:col-span-2 space-y-md">
          {/* Details */}
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md space-y-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Details</h2>
            <label className="block text-sm text-on-surface-variant">
              Recipe name
              <input disabled={disabled} maxLength={150} value={form.title} onChange={(e) => set({ title: e.target.value })} className={`${input} mt-1`} />
            </label>
            <label className="block text-sm text-on-surface-variant">
              Short intro (optional)
              <textarea
                disabled={disabled}
                rows={3}
                maxLength={2000}
                placeholder="What makes this dish special, when to make it…"
                value={form.intro}
                onChange={(e) => set({ intro: e.target.value })}
                className={`${input} mt-1`}
              />
            </label>
            <div className="grid grid-cols-3 gap-md">
              <label className="block text-sm text-on-surface-variant">
                Prep (min)
                <input disabled={disabled} type="number" min={0} max={1440} value={form.prepMinutes} onChange={(e) => set({ prepMinutes: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="block text-sm text-on-surface-variant">
                Cook (min)
                <input disabled={disabled} type="number" min={0} max={1440} value={form.cookMinutes} onChange={(e) => set({ cookMinutes: e.target.value })} className={`${input} mt-1`} />
              </label>
              <label className="block text-sm text-on-surface-variant">
                Serves
                <input disabled={disabled} type="number" min={1} max={50} value={form.serves} onChange={(e) => set({ serves: e.target.value })} className={`${input} mt-1`} />
              </label>
            </div>
            <div className="flex flex-wrap gap-lg">
              <div>
                <p className="text-sm text-on-surface-variant mb-1.5">Difficulty</p>
                <div className="flex gap-1.5">
                  {DIFFICULTIES.map((d) => (
                    <button key={d.id} type="button" disabled={disabled} aria-pressed={form.difficulty === d.id} onClick={() => set({ difficulty: d.id })} className={chip(form.difficulty === d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm text-on-surface-variant mb-1.5">Spice</p>
                <div className="flex gap-1.5">
                  {SPICE_LEVELS.map((s) => (
                    <button key={s.id} type="button" disabled={disabled} aria-pressed={form.spiceLevel === s.id} onClick={() => set({ spiceLevel: s.id })} className={chip(form.spiceLevel === s.id)}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <label className="block text-sm text-on-surface-variant">
              YouTube video (optional)
              <input
                disabled={disabled}
                type="url"
                placeholder="https://youtu.be/…"
                value={form.videoUrl}
                onChange={(e) => set({ videoUrl: e.target.value })}
                className={`${input} mt-1`}
              />
            </label>
          </section>

          {/* Ingredients */}
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Ingredients</h2>
            <p className="text-xs text-on-surface-variant mb-3">
              Link an ingredient to a product you sell and customers get an "Add to cart" button next to it.
            </p>
            <datalist id="recipe-units">
              {UNIT_SUGGESTIONS.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            {form.ingredients.length === 0 && <p className="text-sm text-outline mb-3">No ingredients yet.</p>}
            <ul className="space-y-2 mb-3">
              {form.ingredients.map((ing, index) => (
                <li key={ing.key} className="rounded border border-outline-variant p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <input disabled={disabled} aria-label="Quantity" placeholder="500" maxLength={30} value={ing.quantity} onChange={(e) => setIngredient(index, { quantity: e.target.value })} className={`${small} w-20`} />
                    <input disabled={disabled} aria-label="Unit" list="recipe-units" placeholder="g" maxLength={20} value={ing.unit} onChange={(e) => setIngredient(index, { unit: e.target.value })} className={`${small} w-24`} />
                    <input disabled={disabled} aria-label="Ingredient" placeholder="Mutton keema" maxLength={100} value={ing.name} onChange={(e) => setIngredient(index, { name: e.target.value })} className={`${small} flex-1 min-w-[140px]`} />
                    {!disabled && (
                      <span className="flex gap-1">
                        <button type="button" aria-label="Move up" onClick={() => set({ ingredients: moveItem(form.ingredients, index, -1) })} disabled={index === 0} className="w-7 h-7 rounded hover:bg-surface-container-low disabled:opacity-30">↑</button>
                        <button type="button" aria-label="Move down" onClick={() => set({ ingredients: moveItem(form.ingredients, index, 1) })} disabled={index === form.ingredients.length - 1} className="w-7 h-7 rounded hover:bg-surface-container-low disabled:opacity-30">↓</button>
                        <button type="button" aria-label="Remove ingredient" onClick={() => set({ ingredients: form.ingredients.filter((_, i) => i !== index) })} className="w-7 h-7 rounded text-error hover:bg-error-container">✕</button>
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <input disabled={disabled} aria-label="Note" placeholder="Note (optional) - e.g. finely chopped" maxLength={100} value={ing.note} onChange={(e) => setIngredient(index, { note: e.target.value })} className={`${small} flex-1 min-w-[160px]`} />
                    <select disabled={disabled} aria-label="Linked product" value={ing.productId} onChange={(e) => setIngredient(index, { productId: e.target.value })} className={`${small} w-56`}>
                      <option value="">Not sold by us</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          🛒 {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </li>
              ))}
            </ul>
            {!disabled && (
              <button
                type="button"
                onClick={() => set({ ingredients: [...form.ingredients, { key: newKey(), quantity: "", unit: "", name: "", note: "", productId: "" }] })}
                className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary-fixed"
              >
                + Add ingredient
              </button>
            )}
          </section>

          {/* Steps */}
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Method</h2>
            <p className="text-xs text-on-surface-variant mb-3">
              One step per action. Set the flame and time, so customers know exactly what to do - they can start a timer
              from each step.
            </p>
            {form.steps.length === 0 && <p className="text-sm text-outline mb-3">No steps yet.</p>}
            <ol className="space-y-3 mb-3">
              {form.steps.map((step, index) => (
                <li key={step.key} className="rounded border border-outline-variant p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold text-on-surface">Step {index + 1}</p>
                    {!disabled && (
                      <span className="flex gap-1">
                        <button type="button" aria-label="Move step up" onClick={() => set({ steps: moveItem(form.steps, index, -1) })} disabled={index === 0} className="w-7 h-7 rounded hover:bg-surface-container-low disabled:opacity-30">↑</button>
                        <button type="button" aria-label="Move step down" onClick={() => set({ steps: moveItem(form.steps, index, 1) })} disabled={index === form.steps.length - 1} className="w-7 h-7 rounded hover:bg-surface-container-low disabled:opacity-30">↓</button>
                        <button type="button" aria-label="Remove step" onClick={() => set({ steps: form.steps.filter((_, i) => i !== index) })} className="w-7 h-7 rounded text-error hover:bg-error-container">✕</button>
                      </span>
                    )}
                  </div>
                  <textarea
                    disabled={disabled}
                    aria-label={`Step ${index + 1}`}
                    rows={3}
                    maxLength={2000}
                    placeholder="e.g. Heat oil, add whole spices and let them crackle."
                    value={step.text}
                    onChange={(e) => setStep(index, { text: e.target.value })}
                    className={input}
                  />
                  <div className="flex flex-wrap items-center gap-3 mt-2">
                    <div className="flex gap-1" role="radiogroup" aria-label="Flame">
                      {FLAMES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          role="radio"
                          aria-checked={step.flame === f.id}
                          disabled={disabled}
                          onClick={() => setStep(index, { flame: f.id })}
                          className={`${chip(step.flame === f.id)} flex items-center gap-1.5 !px-2.5`}
                        >
                          <FlameIcon bars={f.bars} />
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-1.5 text-sm text-on-surface-variant">
                      <input disabled={disabled} type="number" min={0} max={600} aria-label="Minutes" value={step.minutes} onChange={(e) => setStep(index, { minutes: e.target.value })} className={`${small} w-20`} />
                      min
                    </label>
                  </div>
                  <input
                    disabled={disabled}
                    aria-label="Tip"
                    maxLength={300}
                    placeholder="Tip (optional) - e.g. Don't add water, the keema cooks in its own juices"
                    value={step.tip}
                    onChange={(e) => setStep(index, { tip: e.target.value })}
                    className={`${input} mt-2`}
                  />
                  <div className="flex items-center gap-3 mt-2">
                    {step.imageUrl ? (
                      <>
                        <img src={step.imageUrl} alt="" className="w-24 h-16 object-cover rounded border border-outline-variant" />
                        {!disabled && (
                          <button type="button" onClick={() => setStep(index, { imagePath: null, imageUrl: null })} className="text-xs text-error underline">
                            Remove photo
                          </button>
                        )}
                      </>
                    ) : (
                      !disabled && (
                        <label className="text-xs text-primary underline cursor-pointer">
                          {uploading === step.key ? "Uploading…" : "+ Add a photo for this step"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => upload(e.target.files, step.key)} />
                        </label>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {!disabled && (
              <button
                type="button"
                onClick={() => set({ steps: [...form.steps, { key: newKey(), text: "", flame: "medium", minutes: "", tip: "", imagePath: null, imageUrl: null }] })}
                className="text-sm px-3 py-1.5 rounded border border-primary text-primary hover:bg-primary-fixed"
              >
                + Add step
              </button>
            )}
          </section>
        </div>

        {/* Right: photos + publish */}
        <div className="space-y-md">
          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Photos</h2>
            <p className="text-xs text-on-surface-variant mb-3">The first photo is the cover. Up to 10.</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {form.images.map((img, index) => (
                <div key={img.path} className="relative aspect-square rounded overflow-hidden border border-outline-variant">
                  <img src={img.url} alt="" className="w-full h-full object-cover" />
                  {index === 0 && <span className="absolute top-1 left-1 text-[10px] font-bold bg-black/60 text-white px-1.5 rounded">COVER</span>}
                  {!disabled && (
                    <div className="absolute bottom-1 right-1 flex gap-0.5">
                      <button type="button" aria-label="Move photo left" disabled={index === 0} onClick={() => set({ images: moveItem(form.images, index, -1) })} className="w-6 h-6 rounded bg-white/90 text-xs disabled:opacity-30">←</button>
                      <button type="button" aria-label="Remove photo" onClick={() => set({ images: form.images.filter((_, i) => i !== index) })} className="w-6 h-6 rounded bg-white/90 text-xs text-error">✕</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {!disabled && form.images.length < 10 && (
              <>
                <button type="button" onClick={() => galleryInput.current?.click()} disabled={uploading === "gallery"} className="w-full text-sm px-3 py-2 rounded border border-dashed border-outline-variant hover:bg-surface-container-low disabled:opacity-50">
                  {uploading === "gallery" ? "Uploading…" : "+ Add photos"}
                </button>
                <input
                  ref={galleryInput}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    upload(e.target.files, "gallery");
                    e.target.value = "";
                  }}
                />
              </>
            )}
          </section>

          <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-on-surface">Show on the site</p>
                <p className="text-xs text-on-surface-variant">Needs at least one ingredient and one step.</p>
              </div>
              <Toggle checked={form.isPublished} disabled={disabled} onChange={(v) => set({ isPublished: v })} />
            </div>
          </section>
        </div>
      </div>

      {/* Sticky save bar */}
      {canUpdate && (
        <div className="fixed bottom-0 right-0 left-0 md:left-sidebar-width z-40 bg-surface-container-lowest border-t border-outline-variant px-md py-sm flex items-center justify-end gap-3">
          <span className="text-sm text-on-surface-variant mr-auto">{uploading ? "Uploading photo…" : isDirty ? "Unsaved changes" : "All changes saved"}</span>
          <button type="button" onClick={() => save()} disabled={isSaving || !isDirty || Boolean(uploading)} className="text-sm px-5 py-2 rounded bg-primary-container text-on-primary disabled:opacity-50">
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
