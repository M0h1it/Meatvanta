import { useEffect, useRef } from "react";
import { useMediaQuery, PHONE_QUERY, REDUCED_MOTION_QUERY } from "../useMediaQuery";
import { ratioToCss, focusToObjectPosition } from "../bannerShape";

/**
 * The picture or video of one banner.
 * - layout "auto": shown at its own shape, never trimmed.
 * - fixed shape (e.g. 3:1): the spot keeps that shape and the picture fills
 *   it, trimmed around the banner's focus point (center/top/bottom/left/right).
 * Phones get the phone version when the admin uploaded one.
 * Videos play silently on loop like a GIF; with "reduce motion" switched on,
 * only the cover image is shown.
 */
export default function BannerMedia({ banner, layout, eager = false, playing = true }) {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const reduceMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const videoRef = useRef(null);
  const alt = banner.altText || "Offer";

  const aspect = ratioToCss(isPhone ? layout?.mobileRatio : layout?.desktopRatio);
  const fixed = Boolean(aspect);
  const mediaClass = fixed ? "absolute inset-0 block w-full h-full object-cover" : "block w-full h-auto";
  const mediaStyle = fixed ? { objectPosition: focusToObjectPosition(banner.focus) } : undefined;

  // Slides that are off-screen in a slider pause, so only one video plays.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play?.().catch(() => {});
    else video.pause?.();
  }, [playing]);

  let media;
  if (banner.mediaType === "video") {
    const src = (isPhone && banner.mobileUrl) || banner.desktopUrl;
    media =
      reduceMotion && banner.posterUrl ? (
        <img src={banner.posterUrl} alt={alt} className={mediaClass} style={mediaStyle} />
      ) : (
        <video
          ref={videoRef}
          key={src}
          src={src}
          poster={banner.posterUrl || undefined}
          muted
          loop
          playsInline
          autoPlay={playing && !reduceMotion}
          preload={eager ? "auto" : "metadata"}
          aria-label={alt}
          className={mediaClass}
          style={mediaStyle}
        />
      );
  } else {
    media = (
      <picture>
        {banner.mobileUrl && <source media={PHONE_QUERY} srcSet={banner.mobileUrl} />}
        <img
          src={banner.desktopUrl}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className={mediaClass}
          style={mediaStyle}
        />
      </picture>
    );
  }

  if (!fixed) return media;
  // The box reserves the exact space before the picture loads - no page jump.
  return (
    <div className="relative w-full overflow-hidden bg-surface-alt" style={{ aspectRatio: aspect }}>
      {media}
    </div>
  );
}
