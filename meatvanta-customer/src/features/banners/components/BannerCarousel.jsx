import { useCallback, useEffect, useRef, useState } from "react";
import BannerLink from "./BannerLink";
import BannerMedia from "./BannerMedia";
import { useMediaQuery, REDUCED_MOTION_QUERY } from "../useMediaQuery";

const AUTO_ADVANCE_MS = 5000;

/**
 * One or more banners. A single banner renders plainly; several become a
 * slider: swipe on phones, arrows on computers, dots on both, and it moves on
 * by itself every few seconds (paused while the customer hovers, touches or
 * focuses it, when the tab is hidden, and never with "reduce motion").
 */
export default function BannerCarousel({ banners, layout, eager = false, label = "Offers", onLinkClick, rounded = true }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const many = banners.length > 1;
  const radius = rounded ? "rounded-lg" : "";

  const goTo = useCallback(
    (index) => {
      const track = trackRef.current;
      if (!track) return;
      const next = (index + banners.length) % banners.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    },
    [banners.length, reduceMotion]
  );

  function onScroll() {
    const track = trackRef.current;
    if (!track || !track.clientWidth) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    if (index !== active) setActive(index);
  }

  useEffect(() => {
    if (!many || paused || reduceMotion) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") goTo(active + 1);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [many, paused, reduceMotion, active, goTo]);

  if (banners.length === 0) return null;

  if (!many) {
    return (
      <BannerLink banner={banners[0]} onClick={onLinkClick} className={`block overflow-hidden ${radius}`}>
        <BannerMedia banner={banners[0]} layout={layout} eager={eager} />
      </BannerLink>
    );
  }

  return (
    <div
      className={`group relative overflow-hidden ${radius}`}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex items-center overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner, index) => (
          <div
            key={banner.id}
            className="w-full shrink-0 snap-center"
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${banners.length}`}
            aria-hidden={index !== active}
          >
            <BannerLink banner={banner} onClick={onLinkClick} className="block" >
              <BannerMedia banner={banner} layout={layout} eager={eager && index === 0} playing={index === active} />
            </BannerLink>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => goTo(active - 1)}
        aria-label="Previous offer"
        className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <span className="material-symbols-outlined">chevron_left</span>
      </button>
      <button
        type="button"
        onClick={() => goTo(active + 1)}
        aria-label="Next offer"
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
      >
        <span className="material-symbols-outlined">chevron_right</span>
      </button>

      <div className="absolute bottom-2.5 inset-x-0 flex justify-center gap-1.5">
        {banners.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            onClick={() => goTo(index)}
            aria-label={`Show offer ${index + 1}`}
            aria-current={index === active}
            className="p-1"
          >
            <span
              className={`block h-1.5 rounded-full shadow transition-all ${
                index === active ? "w-5 bg-white" : "w-1.5 bg-white/60"
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
