import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useBanners, useBannerLayout } from "../useBanners";
import BannerCarousel from "./BannerCarousel";

const SHOW_AFTER_MS = 1500;
// Never interrupt someone who is paying.
const QUIET_PATHS = ["/checkout", "/order-confirmation"];

/** Remembers, for this browser tab session, which version of the popup was seen. */
function seenKey(banners) {
  return `mv_offer_popup_${banners.map((b) => `${b.id}.${b.version}`).join("_")}`;
}
function hasSeen(key) {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function markSeen(key) {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    /* storage blocked - the popup may show again, which is harmless */
  }
}

/**
 * Pop-up offer: appears once per visit, a moment after the site opens.
 * Several live pop-ups show together as one slider. Nothing live = nothing at all.
 */
export default function OfferPopup() {
  const banners = useBanners("popup");
  const layout = useBannerLayout("popup");
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const closeRef = useRef(null);
  const key = banners.length ? seenKey(banners) : null;

  useEffect(() => {
    if (!key || hasSeen(key) || QUIET_PATHS.some((p) => pathname.startsWith(p))) return undefined;
    const timer = setTimeout(() => {
      setOpen(true);
      markSeen(key);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [key, pathname]);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || banners.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-5 animate-[fadeIn_200ms_ease-out]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Special offer"
        className="relative w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close offer"
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white text-ink shadow-lg flex items-center justify-center hover:bg-surface"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
        <div className="shadow-2xl rounded-lg overflow-hidden">
          <BannerCarousel banners={banners} layout={layout} eager label="Special offers" onLinkClick={() => setOpen(false)} />
        </div>
      </div>
    </div>
  );
}
