/**
 * Two real assets in /public:
 *  - logo-login.webp  - the full circular "M" badge on a white background,
 *                       used on the Login/Forgot Password cards (which sit
 *                       on a near-white surface, so the white backing blends in).
 *  - logo-sidebar.webp - the same badge with a transparent background,
 *                        cleaned up for use on the sidebar's dark red bg.
 *
 * variant="login"   -> logo-login.webp (Login, Forgot Password)
 * variant="sidebar" (default) -> logo-sidebar.webp (Sidebar nav)
 */
export default function BrandLogo({ className = "h-9 w-9", variant = "sidebar", showFallbackText = false }) {
  const src = variant === "login" ? "/logo-login.webp" : "/logo-sidebar.webp";
  return (
    <span className={`inline-flex items-center justify-center shrink-0 ${className}`}>
      <img
        src={src}
        alt="Meat Vanta"
        className="h-full w-full object-contain"
        onError={(e) => {
          // No logo file yet - fall back to a monogram tile rather than a broken image.
          e.currentTarget.style.display = "none";
          e.currentTarget.nextElementSibling.style.display = "flex";
        }}
      />
      <span
        style={{ display: "none" }}
        className="h-full w-full items-center justify-center rounded bg-accent text-white font-extrabold text-sm tracking-tight"
      >
        MV
      </span>
      {showFallbackText && <span className="sr-only">Meat Vanta</span>}
    </span>
  );
}
