import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Product photo gallery.
 *  - Mobile: swipe between photos (native CSS scroll-snap, no library), dots below.
 *  - Desktop: arrow buttons on hover, thumbnails below, keyboard left/right.
 * With a single photo it renders exactly like the old single image.
 *
 * Props:
 *  - images      [{ id, url }] in display order (first = cover)
 *  - fallbackSrc image to show when the product has no uploaded photos
 *  - alt         base alt text
 */
export default function ProductGallery({ images = [], fallbackSrc, alt }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const photos = images.length > 0 ? images : [{ id: "fallback", url: fallbackSrc }];
  const hasMany = photos.length > 1;

  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    track.scrollTo({ left: index * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
  }, []);

  // Keep the active dot/thumbnail in sync with whatever the user swiped to.
  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== activeIndex) setActiveIndex(index);
  }

  // Another product opened on the same page (related items) -> back to its cover.
  useEffect(() => {
    setActiveIndex(0);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [images]);

  function go(delta) {
    const next = Math.min(Math.max(activeIndex + delta, 0), photos.length - 1);
    scrollToIndex(next);
  }

  function handleKeyDown(e) {
    if (!hasMany) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    }
  }

  // Laptop: thumbnails run down the left (Amazon style) and the main photo is a
  // square sized to the screen height, so the whole photo is always in view and
  // fills its frame - no empty bars. Phone: full-width swipeable photo + dots.
  const SIZE = "md:w-[min(60vh,500px)] md:h-[min(60vh,500px)]";
  return (
    <div className="md:sticky md:top-28 md:self-start md:flex md:gap-3">
      {hasMany && (
        <div
          className="hidden md:flex md:flex-col gap-2 w-16 shrink-0 overflow-y-auto max-h-[min(60vh,500px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Product photos"
        >
          {photos.map((photo, index) => (
            <button
              key={photo.id}
              type="button"
              role="tab"
              onClick={() => scrollToIndex(index)}
              onMouseEnter={() => scrollToIndex(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-selected={index === activeIndex}
              className={`w-16 h-16 shrink-0 rounded overflow-hidden border-2 transition-colors ${
                index === activeIndex ? "border-brand" : "border-hairline opacity-80 hover:opacity-100"
              }`}
            >
              <img src={photo.url} alt="" loading="lazy" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className={`group relative rounded overflow-hidden border border-hairline bg-white md:shrink-0 ${SIZE}`}>
        <div
          ref={trackRef}
          onScroll={hasMany ? handleScroll : undefined}
          onKeyDown={handleKeyDown}
          tabIndex={hasMany ? 0 : undefined}
          role={hasMany ? "region" : undefined}
          aria-roledescription={hasMany ? "carousel" : undefined}
          aria-label={hasMany ? `${alt} photos` : undefined}
          className={`flex aspect-square md:aspect-auto md:h-full w-full ${
            hasMany
              ? "overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              : "overflow-hidden"
          }`}
        >
          {photos.map((photo, index) => (
            <img
              key={photo.id}
              src={photo.url}
              alt={hasMany ? `${alt} (photo ${index + 1} of ${photos.length})` : alt}
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              draggable={false}
              className="w-full h-full shrink-0 snap-center object-cover"
            />
          ))}
        </div>

        {hasMany && (
          <>
            <ArrowButton direction="left" disabled={activeIndex === 0} onClick={() => go(-1)} />
            <ArrowButton direction="right" disabled={activeIndex === photos.length - 1} onClick={() => go(1)} />

            {/* Dots: phone only - laptop has the thumbnail column */}
            <div className="md:hidden absolute bottom-3 inset-x-0 flex justify-center gap-1.5 pointer-events-none">
              {photos.map((photo, index) => (
                <span
                  key={photo.id}
                  className={`h-1.5 rounded-full transition-all ${
                    index === activeIndex ? "w-5 bg-white" : "w-1.5 bg-white/60"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ArrowButton({ direction, disabled, onClick }) {
  const isLeft = direction === "left";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isLeft ? "Previous photo" : "Next photo"}
      className={`hidden md:flex absolute top-1/2 -translate-y-1/2 ${
        isLeft ? "left-3" : "right-3"
      } w-10 h-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:!opacity-0 disabled:pointer-events-none hover:bg-white`}
    >
      <span className="material-symbols-outlined">{isLeft ? "chevron_left" : "chevron_right"}</span>
    </button>
  );
}
