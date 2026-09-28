import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchRecipes, createRecipe, deleteRecipe, setRecipePublished } from "../api/recipesApi";
import { usePermission } from "../../../hooks/usePermission";
import { showSuccess, showError, showConfirm } from "../../../lib/sweetAlert";
import Modal from "../../../components/common/Modal";
import Toggle from "../../../components/common/Toggle";
import { totalTime } from "../lib/recipeOptions";

/** Recipes list. The Recipes menu on the site only appears once one is published. */
export default function RecipesPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission("recipes:create");
  const canUpdate = hasPermission("recipes:update");
  const canDelete = hasPermission("recipes:delete");

  const [recipes, setRecipes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newTitle, setNewTitle] = useState(null); // null = modal closed
  const [isBusy, setIsBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecipes(await fetchRecipes());
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "Couldn't load recipes.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setIsBusy(true);
    try {
      const recipe = await createRecipe(newTitle);
      setNewTitle(null);
      navigate(`/recipes/${recipe.id}`);
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't create the recipe.");
    } finally {
      setIsBusy(false);
    }
  }

  async function togglePublished(recipe, next) {
    try {
      await setRecipePublished(recipe.id, next);
      await load();
      showSuccess(next ? "Recipe is live on the site." : "Recipe hidden from the site.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't change it.");
    }
  }

  async function remove(recipe) {
    const ok = await showConfirm({
      title: `Delete "${recipe.title}"?`,
      text: "The recipe and its photos are removed for good.",
      confirmButtonText: "Delete",
    });
    if (!ok) return;
    try {
      await deleteRecipe(recipe.id);
      await load();
      showSuccess("Recipe deleted.");
    } catch (err) {
      showError(err.response?.data?.message || "Couldn't delete it.");
    }
  }

  const liveCount = recipes.filter((r) => r.isPublished).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Recipes</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-0.5">
            {liveCount} live on the site.{" "}
            {liveCount === 0 && "The Recipes menu shows on the site once one is published."}
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setNewTitle("")} className="flex items-center gap-1.5 text-sm px-4 py-2 rounded bg-primary-container text-on-primary hover:opacity-90">
            <span className="material-symbols-outlined text-lg">add</span>
            New recipe
          </button>
        )}
      </div>

      {error && <div className="bg-error-container text-on-error-container rounded-lg px-md py-sm mb-md text-sm">{error}</div>}

      {isLoading ? (
        <p className="text-sm text-on-surface-variant">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-outline-variant p-lg text-center text-sm text-on-surface-variant">
          No recipes yet. Write your first one - e.g. "Mutton Keema Masala" - and link the meat you sell so customers can add it to the cart.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-md">
          {recipes.map((r) => (
            <div key={r.id} className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
              <Link to={`/recipes/${r.id}`} className="block aspect-[16/9] bg-surface-container-low">
                {r.imageUrl ? (
                  <img src={r.imageUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-sm text-outline">No photo yet</span>
                )}
              </Link>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/recipes/${r.id}`} className="font-medium text-on-surface hover:text-primary leading-tight">
                    {r.title}
                  </Link>
                  <span
                    className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      r.isPublished ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface-variant"
                    }`}
                  >
                    {r.isPublished ? "Live" : "Draft"}
                  </span>
                </div>
                <p className="text-xs text-on-surface-variant mt-1">
                  {r._count?.ingredients ?? 0} ingredients · {r._count?.steps ?? 0} steps
                  {totalTime(r) ? ` · ${totalTime(r)}` : ""}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-outline-variant">
                  {canUpdate ? (
                    <label className="flex items-center gap-2 text-xs text-on-surface-variant">
                      Show on site
                      <Toggle checked={r.isPublished} showLabel={false} onChange={(next) => togglePublished(r, next)} />
                    </label>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-1">
                    <Link to={`/recipes/${r.id}`} className="text-xs px-2 py-1 rounded border border-outline-variant hover:bg-surface-container-low">
                      Edit
                    </Link>
                    {canDelete && (
                      <button onClick={() => remove(r)} className="text-xs px-2 py-1 rounded border border-outline-variant text-error hover:bg-error-container">
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={newTitle !== null} onClose={() => setNewTitle(null)} title="New recipe">
        <form onSubmit={create} className="p-lg space-y-md">
          <label className="block text-sm text-on-surface-variant">
            Recipe name
            <input
              autoFocus
              required
              minLength={3}
              maxLength={150}
              placeholder="e.g. Mutton Keema Masala"
              value={newTitle || ""}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full mt-1 rounded border border-outline-variant px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
          <p className="text-xs text-on-surface-variant">It starts as a draft - nobody sees it until you publish.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewTitle(null)} className="text-sm px-4 py-2 rounded border border-outline-variant hover:bg-surface-container-low">
              Cancel
            </button>
            <button type="submit" disabled={isBusy} className="text-sm px-4 py-2 rounded bg-primary-container text-on-primary disabled:opacity-50">
              Create & write
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
