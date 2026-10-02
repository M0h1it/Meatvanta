import { Link } from "react-router-dom";

/**
 * Home page card for a category added in admin. The uploaded picture is the
 * whole card - the name and artwork are part of that picture - and the only
 * thing added on top is the "Shop Now" button:
 *  - laptop: the button fades in when you hover the card
 *  - phone / touch screens: the button is always visible
 * The two original categories (Chicken, Mutton) keep their own artwork in HomePage.
 * A category with no picture (older ones) falls back to a plain red card.
 */
function ShopNowButton({ className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1 bg-accent text-ink font-bold rounded-full shadow-md ${className}`}
    >
      Shop Now
      <span className="material-symbols-outlined text-base">arrow_forward</span>
    </span>
  );
}

export default function CategoryCard({ category }) {
  const desktopImg = category.imageUrl || category.mobileImageUrl || null;
  const mobileImg = category.mobileImageUrl || category.imageUrl || null;
  // A phone picture is normally portrait; without one the wide picture is reused.
  const mobileShape = category.mobileImageUrl ? "aspect-[1024/1536]" : "aspect-[1983/793]";

  return (
    <Link
      to={`/shop?category=${category.id}`}
      aria-label={`Shop ${category.name}`}
      className="group block rounded-lg overflow-hidden bg-brand shadow-sm"
    >
      {desktopImg ? (
        <>
          {/* Laptop / tablet */}
          <div className="hidden sm:block relative aspect-[1983/793] overflow-hidden">
            <img
              src={desktopImg}
              alt={category.name}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
            />
            <div className="absolute left-[54%] right-[3%] bottom-[9%] flex justify-center opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-300">
              <ShopNowButton className="text-[clamp(0.65rem,1vw,0.85rem)] px-5 py-2" />
            </div>
          </div>

          {/* Phone */}
          <div className={`sm:hidden relative ${mobileShape} overflow-hidden`}>
            <img src={mobileImg} alt={category.name} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-[5%] flex justify-center">
              <ShopNowButton className="text-xs px-4 py-1.5" />
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center justify-center text-center gap-3 px-4 py-10 sm:py-0 sm:aspect-[1983/793] bg-brand">
          <p className="font-display font-bold text-white text-xl md:text-[clamp(1.25rem,2.4vw,1.9rem)] leading-tight">
            {category.name}
          </p>
          <ShopNowButton className="text-xs md:text-sm px-5 py-2" />
        </div>
      )}
    </Link>
  );
}