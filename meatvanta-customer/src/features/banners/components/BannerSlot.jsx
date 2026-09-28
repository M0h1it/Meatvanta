import { useBanners, useBannerLayout } from "../useBanners";
import BannerCarousel from "./BannerCarousel";

/**
 * A spot on the page where the admin can place offers.
 * Renders NOTHING (no box, no gap) when that spot has no live banner.
 *
 * className = vertical spacing around the banner when it does show.
 * inset:
 *   "padded" - the slot adds the page's side margin itself (use on full-width sections)
 *   "inside" - the parent already has the side margin (use inside a .page-x container)
 * When the admin picks "full width" for the spot, the side margin and rounded
 * corners are dropped so the banner runs edge to edge.
 */
export default function BannerSlot({ placement, className = "", inset = "padded", eager = false, label }) {
  const banners = useBanners(placement);
  const layout = useBannerLayout(placement);
  if (banners.length === 0) return null;

  const full = Boolean(layout.fullWidth);
  let sideClass = "";
  if (inset === "padded" && !full) sideClass = "page-x";
  if (inset === "inside" && full) sideClass = "-mx-gutter md:-mx-gutter-lg";

  return (
    <section className={`${sideClass} ${className}`.trim()} aria-label={label || "Offers"}>
      <BannerCarousel banners={banners} layout={layout} eager={eager} label={label || "Offers"} rounded={!full} />
    </section>
  );
}
