import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRecipe } from "../api/recipesApi";
import { useCart } from "../../../hooks/useCart";
import { useDocumentMeta } from "../../../hooks/useDocumentMeta";
import ProductGallery from "../../product/components/ProductGallery";
import StepTimer from "../components/StepTimer";
import { DIFFICULTY_LABEL, SPICE_LABEL, FLAME, SpiceMeter, FlameIcon, formatMinutes } from "../components/recipeMeta";

const amount = (ing) => [ing.quantity, ing.unit].filter(Boolean).join(" ");

/** schema.org Recipe, so search engines can show it as a recipe result. */
function useRecipeJsonLd(recipe) {
  useEffect(() => {
    if (!recipe) return undefined;
    const iso = (m) => (m ? `PT${m}M` : undefined);
    const data = {
      "@context": "https://schema.org",
      "@type": "Recipe",
      name: recipe.title,
      description: recipe.intro || undefined,
      image: recipe.images.length ? recipe.images : undefined,
      prepTime: iso(recipe.prepMinutes),
      cookTime: iso(recipe.cookMinutes),
      totalTime: iso(recipe.totalMinutes),
      recipeYield: recipe.serves ? `${recipe.serves} servings` : undefined,
      recipeIngredient: recipe.ingredients.map((i) => [amount(i), i.name, i.note ? `(${i.note})` : ""].filter(Boolean).join(" ")),
      recipeInstructions: recipe.steps.map((s) => ({ "@type": "HowToStep", text: s.text })),
      author: { "@type": "Organization", name: "Meat Vanta" },
    };
    const tag = document.createElement("script");
    tag.type = "application/ld+json";
    tag.textContent = JSON.stringify(data);
    document.head.appendChild(tag);
    return () => tag.remove();
  }, [recipe]);
}

export default function RecipeDetailPage() {
  const { slug } = useParams();
  const { addItem } = useCart();
  const [recipe, setRecipe] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [have, setHave] = useState({}); // ingredient id -> ticked
  const [doneSteps, setDoneSteps] = useState({});
  const [added, setAdded] = useState({}); // ingredient id -> just added

  useEffect(() => {
    setRecipe(null);
    setNotFound(false);
    setHave({});
    setDoneSteps({});
    fetchRecipe(slug)
      .then(setRecipe)
      .catch(() => setNotFound(true));
  }, [slug]);

  useDocumentMeta({
    title: recipe ? `${recipe.title} Recipe` : undefined,
    description: recipe ? recipe.intro || `How to make ${recipe.title} - ingredients, step-by-step method, flame and timings.` : undefined,
    path: recipe ? `/recipes/${recipe.slug}` : undefined,
    image: recipe?.images?.[0],
  });
  useRecipeJsonLd(recipe);

  if (notFound) {
    return (
      <div className="page-x py-20 text-center">
        <p className="font-display text-2xl font-bold text-ink mb-2">Recipe not found</p>
        <Link to="/recipes" className="text-brand font-semibold underline">
          All recipes
        </Link>
      </div>
    );
  }
  if (!recipe) return <div className="page-x py-16 text-sm text-ink/60">Loading…</div>;

  const buyable = recipe.ingredients.filter((i) => i.product?.quickAdd);

  function add(ing) {
    const q = ing.product.quickAdd;
    addItem({ id: ing.product.id, name: ing.product.name, imageUrl: ing.product.imageUrl }, { id: q.variantId, label: q.label, price: q.price }, 1);
    setAdded((a) => ({ ...a, [ing.id]: true }));
  }

  const facts = [
    recipe.prepMinutes ? { label: "Prep", value: formatMinutes(recipe.prepMinutes) } : null,
    recipe.cookMinutes ? { label: "Cook", value: formatMinutes(recipe.cookMinutes) } : null,
    recipe.serves ? { label: "Serves", value: recipe.serves } : null,
    { label: "Level", value: DIFFICULTY_LABEL[recipe.difficulty] || "Easy" },
  ].filter(Boolean);

  return (
    <div className="pb-16">
      <div className="page-x py-6 md:py-10">
        <nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-wide text-ink/50 mb-5">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/recipes" className="hover:text-brand">Recipes</Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{recipe.title}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
          {recipe.images.length > 0 ? (
            <ProductGallery images={recipe.images.map((url, i) => ({ id: i, url }))} alt={recipe.title} />
          ) : (
            <div className="aspect-square rounded bg-surface-alt flex items-center justify-center text-ink/25">
              <span className="material-symbols-outlined text-7xl">skillet</span>
            </div>
          )}

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand mb-1.5">Recipe</p>
            <h1 className="font-display text-headline-lg text-ink mb-3">{recipe.title}</h1>
            {recipe.intro && <p className="text-ink/70 leading-relaxed mb-5 whitespace-pre-line">{recipe.intro}</p>}

            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              {facts.map((f) => (
                <div key={f.label} className="bg-white border border-hairline rounded px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wide text-ink/50">{f.label}</dt>
                  <dd className="font-bold text-ink">{f.value}</dd>
                </div>
              ))}
            </dl>
            <p className="flex items-center gap-2 text-sm text-ink/70 mb-6">
              <SpiceMeter level={recipe.spiceLevel} /> {SPICE_LABEL[recipe.spiceLevel]}
            </p>

            {buyable.length > 0 && (
              <div className="bg-brand-soft/40 border border-brand/20 rounded p-4">
                <p className="font-bold text-ink">Get the meat for this recipe</p>
                <p className="text-sm text-ink/60 mb-3">Cut fresh the morning it's delivered.</p>
                <ul className="space-y-2">
                  {buyable.map((ing) => (
                    <li key={ing.id} className="flex items-center gap-3">
                      <img src={ing.product.imageUrl || ""} alt="" className="w-10 h-10 rounded object-cover bg-surface-alt" />
                      <Link to={`/product/${ing.product.id}`} className="flex-1 min-w-0 text-sm font-semibold text-ink hover:text-brand truncate">
                        {ing.product.name} <span className="font-normal text-ink/50">· {ing.product.quickAdd.label}</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => add(ing)}
                        className="shrink-0 text-sm font-semibold px-3 py-1.5 rounded-full bg-brand text-white hover:bg-brand-dark"
                      >
                        {added[ing.id] ? "Added ✓" : `Add ₹${ing.product.quickAdd.price}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {recipe.videoId && (
        <div className="page-x pb-10">
          <div className="aspect-video max-w-3xl rounded overflow-hidden bg-black">
            <iframe
              title={`${recipe.title} video`}
              src={`https://www.youtube-nocookie.com/embed/${recipe.videoId}`}
              className="w-full h-full"
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <div className="page-x grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Ingredients */}
        <section className="lg:col-span-1">
          <div className="bg-white border border-hairline rounded p-5 lg:sticky lg:top-24">
            <h2 className="font-display text-xl font-bold text-ink mb-1">Ingredients</h2>
            <p className="text-xs text-ink/50 mb-4">Tick what you have ready.</p>
            <ul className="space-y-2.5">
              {recipe.ingredients.map((ing) => (
                <li key={ing.id}>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(have[ing.id])}
                      onChange={(e) => setHave((h) => ({ ...h, [ing.id]: e.target.checked }))}
                      className="mt-1 w-4 h-4 accent-[#B4141F]"
                    />
                    <span className={`text-sm ${have[ing.id] ? "line-through text-ink/40" : "text-ink"}`}>
                      {amount(ing) && <strong className="font-semibold">{amount(ing)} </strong>}
                      {ing.name}
                      {ing.note && <span className="text-ink/50">, {ing.note}</span>}
                      {ing.product && (
                        <>
                          {" "}
                        <Link to={`/product/${ing.product.id}`} className="ml-1 text-xs font-semibold text-brand underline">
                          buy
                        </Link>
                        </>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Method */}
        <section className="lg:col-span-2">
          <h2 className="font-display text-xl font-bold text-ink mb-4">Method</h2>
          <ol className="space-y-4">
            {recipe.steps.map((step, index) => {
              const flame = FLAME[step.flame] || FLAME.none;
              const isDone = Boolean(doneSteps[step.id]);
              return (
                <li key={step.id} className={`bg-white border rounded p-4 md:p-5 transition-colors ${isDone ? "border-success/40 bg-success/5" : "border-hairline"}`}>
                  <div className="flex items-start gap-4">
                    <button
                      type="button"
                      onClick={() => setDoneSteps((d) => ({ ...d, [step.id]: !d[step.id] }))}
                      aria-pressed={isDone}
                      aria-label={isDone ? `Step ${index + 1} done` : `Mark step ${index + 1} done`}
                      className={`shrink-0 w-9 h-9 rounded-full font-bold flex items-center justify-center border-2 ${
                        isDone ? "bg-success border-success text-white" : "border-brand text-brand"
                      }`}
                    >
                      {isDone ? "✓" : index + 1}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {step.flame !== "none" && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-brand bg-brand-soft/50 px-2 py-1 rounded-sm">
                            <FlameIcon bars={flame.bars} />
                            {flame.label}
                          </span>
                        )}
                        {step.minutes ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-ink/70 bg-surface-alt px-2 py-1 rounded-sm">
                            <span className="material-symbols-outlined text-sm">schedule</span>
                            {step.minutes} min
                          </span>
                        ) : null}
                      </div>
                      <p className={`leading-relaxed whitespace-pre-line ${isDone ? "text-ink/50" : "text-ink"}`}>{step.text}</p>
                      {step.tip && (
                        <p className="mt-3 text-sm text-ink/80 bg-accent-soft/40 border-l-4 border-accent px-3 py-2 rounded-sm">
                          <strong>Tip:</strong> {step.tip}
                        </p>
                      )}
                      {step.imageUrl && <img src={step.imageUrl} alt={`Step ${index + 1}`} loading="lazy" className="mt-3 rounded w-full max-w-md" />}
                      {step.minutes ? (
                        <div className="mt-3">
                          <StepTimer minutes={step.minutes} label={`Step ${index + 1}`} />
                        </div>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
