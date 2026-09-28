import { Link } from "react-router-dom";
import { useRecipes } from "../useRecipes";
import { useDocumentMeta } from "../../../hooks/useDocumentMeta";
import RecipeCard from "../components/RecipeCard";

export default function RecipesPage() {
  const { recipes, isLoading } = useRecipes();

  useDocumentMeta({
    title: "Recipes",
    description: "Step-by-step recipes for chicken and mutton from Meat Vanta - ingredients, flame, timings and tips, so it comes out right every time.",
    path: "/recipes",
  });

  return (
    <div className="page-x py-8 md:py-12">
      <h1 className="font-display text-headline-lg text-ink">Recipes</h1>
      <p className="text-ink/60 mt-1 mb-8 max-w-2xl">
        Cook it the way we do at home - every step with the flame and the time, and the meat you need is one tap away.
      </p>

      {isLoading ? (
        <p className="text-sm text-ink/60">Loading…</p>
      ) : recipes.length === 0 ? (
        <div className="bg-white border border-hairline rounded p-8 text-center">
          <p className="text-ink/70">New recipes are coming soon.</p>
          <Link to="/shop" className="inline-block mt-3 text-brand font-semibold underline">
            Shop fresh cuts
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {recipes.map((r) => (
            <RecipeCard key={r.slug} recipe={r} />
          ))}
        </div>
      )}
    </div>
  );
}
