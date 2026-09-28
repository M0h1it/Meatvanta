import { ratioToCss, focusToObjectPosition } from "../lib/placements";

/**
 * Shows how a banner will look on a computer and on a phone, using the spot's
 * shape and the chosen focus - the same rules the customer site uses.
 *
 * Props: desktopUrl, mobileUrl, isVideo, layout { desktopRatio, mobileRatio, fullWidth }, focus
 */
export default function BannerPreview({ desktopUrl, mobileUrl, isVideo, layout, focus }) {
  if (!desktopUrl) return null;
  return (
    <div className="grid grid-cols-[1fr_auto] gap-md items-start">
      <Frame label="Computer" widthClass="w-full" ratio={layout.desktopRatio} url={desktopUrl} isVideo={isVideo} focus={focus} rounded={!layout.fullWidth} />
      <Frame label="Phone" widthClass="w-28" ratio={layout.mobileRatio} url={mobileUrl || desktopUrl} isVideo={isVideo} focus={focus} rounded={!layout.fullWidth} />
    </div>
  );
}

function Frame({ label, widthClass, ratio, url, isVideo, focus, rounded }) {
  const aspect = ratioToCss(ratio);
  const mediaClass = aspect ? "absolute inset-0 w-full h-full object-cover" : "block w-full h-auto";
  const style = aspect ? { objectPosition: focusToObjectPosition(focus) } : undefined;
  return (
    <figure className={widthClass}>
      <div
        className={`relative overflow-hidden bg-surface-container-high border border-outline-variant ${rounded ? "rounded-md" : ""}`}
        style={aspect ? { aspectRatio: aspect } : undefined}
      >
        {isVideo ? (
          <video src={url} muted autoPlay loop playsInline className={mediaClass} style={style} />
        ) : (
          <img src={url} alt="" className={mediaClass} style={style} />
        )}
      </div>
      <figcaption className="text-[11px] text-on-surface-variant mt-1">
        {label} · {ratio === "auto" || !ratio ? "own shape" : ratio}
      </figcaption>
    </figure>
  );
}
