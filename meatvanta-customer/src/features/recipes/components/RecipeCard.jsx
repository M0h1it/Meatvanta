import { Link } from "react-router-dom";
import { DIFFICULTY_LABEL, SpiceMeter, formatMinutes } from "./recipeMeta";

export default function RecipeCard({ recipe }) {
  return (
    <Link
      to={`/recipes/${recipe.slug}`}
      className="group bg-white rounded border border-hairline overflow-hidden hover:border-brand/40 transition-colors flex flex-col"
    >
      <div className="aspect-[4/3] bg-surface-alt overflow-hidden">
        {recipe.imageUrl ? (
          <img
            src={recipe.imageUrl}
            alt={recipe.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink/30">
            <span className="material-symbols-outlined text-5xl">skillet</span>
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-bold text-ink leading-snug">{recipe.title}</h3>
        {recipe.intro && <p className="text-sm text-ink/60 mt-1 line-clamp-2">{recipe.intro}</p>}
        <div className="mt-auto pt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-ink/60">
          {formatMinutes(recipe.totalMinutes) && (
            <span className="inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">schedule</span>
              {formatMinutes(recipe.totalMinutes)}
            </span>
          )}
          {recipe.serves && <span>Serves {recipe.serves}</span>}
          <span>{DIFFICULTY_LABEL[recipe.difficulty] || "Easy"}</span>
          <SpiceMeter level={recipe.spiceLevel} />
        </div>
      </div>
    </Link>
  );
}
