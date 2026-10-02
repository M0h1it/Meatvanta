import { useCallback, useEffect, useRef, useState } from "react";
import CategoryCard from "./CategoryCard";

/**
 * Categories as a swipeable slider (the usual pattern on shopping sites):
 *  - phone: one card at a time with the next one peeking in, swipe to move
 *  - laptop: two cards across, arrow buttons appear when there are more
 * Any number of categories works - no grid to rebalance when one is added.
 */
export default function CategorySlider({ categories }) {
  const trackRef = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoOn, setCanGoOn] = useState(false);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanGoBack(el.scrollLeft > 4);
    setCanGoOn(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [update, categories.length]);

  function move(direction) {
    const el = trackRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: reduceMotion ? "auto" : "smooth" });
  }

  const single = categories.length === 1;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        onScroll={update}
        className="flex gap-4 md:gap-5 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {categories.map((category) => (
          <div
            key={category.id}
            className={`snap-start shrink-0 ${
              single ? "w-full" : "w-[86%] sm:w-[calc(50%-0.625rem)]"
            }`}
          >
            <CategoryCard category={category} />
          </div>
        ))}
      </div>

      {canGoBack && (
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Previous categories"
          className="hidden sm:flex absolute -left-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full bg-white text-ink shadow-lg border border-hairline hover:bg-brand hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">chevron_left</span>
        </button>
      )}
      {canGoOn && (
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="More categories"
          className="hidden sm:flex absolute -right-3 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full bg-white text-ink shadow-lg border border-hairline hover:bg-brand hover:text-white transition-colors"
        >
          <span className="material-symbols-outlined">chevron_right</span>
        </button>
      )}
    </div>
  );
}