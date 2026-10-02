import { Link } from "react-router-dom";

/**
 * Home page card for a category added in admin. Name and "Shop Now" come from
 * the category itself, so a new category needs nothing but (optionally) a photo:
 *  - with a photo: photo on the left, red panel on the right (stacked on phones)
 *  - without one:  a plain red card, so it never looks broken
 * The two original categories (Chicken, Mutton) keep their hand-made artwork
 * in HomePage - this card is for everything else.
 */
export default function CategoryCard({ category }) {
  const desktopImg = category.imageUrl || category.mobileImageUrl || null;
  const mobileImg = category.mobileImageUrl || category.imageUrl || null;
  const count = category._count?.products;

  const name = (
    <p className="font-display font-bold text-white text-xl md:text-[clamp(1.25rem,2.4vw,1.9rem)] leading-tight">
      {category.name}
    </p>
  );
  const countLine =
    typeof count === "number" && count > 0 ? (
      <p className="text-white/80 text-xs md:text-sm mt-1">
        {count} {count === 1 ? "item" : "items"} available
      </p>
    ) : null;
  const shopNow = (
    <span className="mt-3 inline-flex items-center gap-1 bg-accent text-ink text-xs md:text-sm font-bold px-4 py-1.5 md:px-5 md:py-2 rounded-full">
      Shop Now
      <span className="material-symbols-outlined text-base">arrow_forward</span>
    </span>
  );

  // Phone: everything visible, with space under the button.
  const label = (
    <>
      {name}
      {countLine}
      {shopNow}
    </>
  );

  // Laptop: only the name shows; the item count and "Shop Now" fade in on hover
  // (touch screens without hover always show them). Bottom padding keeps the
  // button off the card's edge.
  const hoverLabel = (
    <>
      {name}
      <div className="grid grid-rows-[0fr] group-hover:grid-rows-[1fr] [@media(hover:none)]:grid-rows-[1fr] transition-all duration-300 ease-out w-full">
        <div className="overflow-hidden flex flex-col items-center pb-5">
          <div className="opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-300 flex flex-col items-center">
            {countLine}
            {shopNow}
          </div>
        </div>
      </div>
    </>
  );

  return (
    <Link to={`/shop?category=${category.id}`} className="group block rounded-lg overflow-hidden bg-brand shadow-sm">
      {desktopImg ? (
        <>
          {/* Tablet / laptop: photo left, red panel right */}
          <div className="hidden sm:grid grid-cols-[1.25fr_1fr] aspect-[1983/793]">
            <div className="relative overflow-hidden">
              <img
                src={desktopImg}
                alt={category.name}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
              />
            </div>
            <div className="flex flex-col items-center justify-center text-center px-4 bg-brand">{hoverLabel}</div>
          </div>

          {/* Phone: photo on top, red strip below */}
          <div className="sm:hidden">
            <div className="relative aspect-[4/3] overflow-hidden">
              <img src={mobileImg} alt={category.name} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
            </div>
            <div className="flex flex-col items-center text-center px-4 pt-4 pb-5 bg-brand">{label}</div>
          </div>
        </>
      ) : (
        <div className="relative flex flex-col items-center justify-center text-center px-4 py-8 sm:py-0 sm:aspect-[1983/793] bg-brand overflow-hidden">
          <span
            aria-hidden="true"
            className="material-symbols-outlined absolute -right-4 -bottom-6 text-[8rem] text-white/10 pointer-events-none"
          >
            restaurant
          </span>
          <div className="relative flex flex-col items-center sm:hidden">{label}</div>
          <div className="relative hidden sm:flex flex-col items-center w-full">{hoverLabel}</div>
        </div>
      )}
    </Link>
  );
}