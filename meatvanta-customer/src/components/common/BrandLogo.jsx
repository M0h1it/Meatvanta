/**
 * Two real assets in /public:
 *  - logo.webp       - the full "meatvanta" wordmark (red/gold text, transparent
 *                      background). Reads fine on light surfaces (the header).
 *  - logo-mark.webp   - just the bull-horn "m" mark, white/gold, transparent
 *                      background. The wordmark's red text nearly disappears
 *                      on the brand-dark red footer, so the footer uses this
 *                      instead, paired with the shop name as text.
 *
 * variant="wordmark" (default) -> logo.png, sized by height, no extra text needed.
 * variant="mark"                -> logo-mark.png, roughly square, pair with text.
 */
export default function BrandLogo({ className = "h-10", variant = "wordmark" }) {
  const src = variant === "mark" ? "/logo-mark.webp" : "/logo.webp";

  return (
    <span className={`inline-flex items-center shrink-0 ${className}`}>
      <img
        src={src}
        alt="Meat Vanta"
        className="h-full w-auto object-contain"
        onError={(e) => {
          e.currentTarget.style.display = "none";
          e.currentTarget.nextElementSibling.style.display = "flex";
        }}
      />
      <span
        style={{ display: "none" }}
        className="h-full aspect-square items-center justify-center rounded bg-accent text-white font-bold text-sm tracking-tight"
      >
        MV
      </span>
    </span>
  );
}
