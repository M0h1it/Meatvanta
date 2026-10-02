import { Link } from "react-router-dom";
import { useShopInfo } from "../../hooks/useShopInfo";
import BrandLogo from "../common/BrandLogo";

const ICONS = {
  instagram: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.8c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V13h2.7v8h3.1z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3L10 15z" />
    </svg>
  ),
};

export default function Footer() {
  const { shopInfo } = useShopInfo();

  const shopName = shopInfo?.shopName || "Meat Vanta";
  const socials = [
    { key: "instagram", label: "Instagram", url: shopInfo?.instagramUrl },
    { key: "facebook", label: "Facebook", url: shopInfo?.facebookUrl },
    { key: "youtube", label: "YouTube", url: shopInfo?.youtubeUrl },
  ].filter((x) => x.url);
  const whatsappDigits = (shopInfo?.whatsappNumber || "").replace(/\D/g, "");

  return (
    <footer className="relative bg-brand-dark text-white/80 overflow-hidden">
      {/* Background artwork - the white top portion is transparent (so it
          blends into this footer's own bg-brand-dark instead of showing as
          a visible white patch), the red wave is opaque. Absolutely
          positioned behind the content below, not a separate block above
          it - the text sits directly on top of this image. */}
      <img
        src="/footer-wave-desktop.webp"
        loading="lazy"
        decoding="async"
        alt=""
        aria-hidden="true"
        className="hidden md:block absolute inset-x-0 top-0 w-full h-auto pointer-events-none select-none"
      />
      <img
        src="/footer-wave-mobile.webp"
        loading="lazy"
        decoding="async"
        alt=""
        aria-hidden="true"
        className="md:hidden absolute inset-x-0 top-0 w-full h-auto pointer-events-none select-none"
      />

      <div className="relative page-x py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <BrandLogo variant="mark" className="h-9" />
              <span className="font-display text-xl font-bold text-white">{shopName}</span>
            </div>
            <p className="text-sm leading-relaxed">
              Fresh Meat <span className="text-accent">|</span> Daily Cut <span className="text-accent">|</span> No
              Frozen
            </p>
            {shopInfo?.yearsInBusiness > 0 && (
              <p className="text-xs text-accent font-semibold mt-2 tracking-wide uppercase">
                {shopInfo.yearsInBusiness}+ Years of Trust
              </p>
            )}

            {/* Socials - links come from Shop Info; an empty one is not shown. */}
            <div className="flex items-center gap-2 mt-4">
              {whatsappDigits && (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="WhatsApp"
                  className="w-8 h-8 rounded-full border border-accent/50 flex items-center justify-center hover:bg-accent hover:text-brand-dark transition-colors"
                >
                  <span className="material-symbols-outlined text-base">chat</span>
                </a>
              )}
              {socials.map((x) => (
                <a
                  key={x.key}
                  href={x.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={x.label}
                  className="w-8 h-8 rounded-full border border-accent/50 flex items-center justify-center hover:bg-accent hover:text-brand-dark transition-colors"
                >
                  {ICONS[x.key]}
                </a>
              ))}
            </div>
          </div>

          <div>
            <p className="text-accent font-bold text-sm mb-3 tracking-wide uppercase">Quick Links</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-accent transition-colors">Home</Link></li>
              <li><Link to="/shop" className="hover:text-accent transition-colors">Shop</Link></li>
              <li><Link to="/about" className="hover:text-accent transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-accent transition-colors">Contact</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-accent font-bold text-sm mb-3 tracking-wide uppercase">Customer Care</p>
            <ul className="space-y-2 text-sm">
              <li><Link to="/faq" className="hover:text-accent transition-colors">FAQs</Link></li>
              <li><Link to="/delivery" className="hover:text-accent transition-colors">Delivery Info</Link></li>
              <li><Link to="/my-orders" className="hover:text-accent transition-colors">Track Order</Link></li>
            </ul>
          </div>

          <div>
            <p className="text-accent font-bold text-sm mb-3 tracking-wide uppercase">Get in Touch</p>
            <ul className="space-y-2 text-sm">
              {shopInfo?.phone && (
                <li>
                  <a href={`tel:${shopInfo.phone}`} className="flex items-center gap-1.5 hover:text-accent transition-colors">
                    <span className="material-symbols-outlined text-base">call</span>
                    {shopInfo.phone}
                  </a>
                </li>
              )}
              {whatsappDigits && (
                <li>
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 hover:text-accent transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">chat</span>
                    WhatsApp
                  </a>
                </li>
              )}
              {shopInfo?.addressLine && (
                <li className="flex items-start gap-1.5">
                  <span className="material-symbols-outlined text-base mt-0.5">location_on</span>
                  <span>{shopInfo.addressLine}</span>
                </li>
              )}
            </ul>
            <p className="font-display italic text-accent text-lg mt-4 underline decoration-accent/40 underline-offset-4">
              Real Meat. Real Freshness.
            </p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/15 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-white/60">
            © {new Date().getFullYear()} {shopName}. All rights reserved.
            {shopInfo?.fssaiNumber && ` · FSSAI Licence No. ${shopInfo.fssaiNumber}`}
          </p>
          <p className="text-xs text-white/60 flex items-center gap-1">
            Made with <span className="text-accent">❤</span> for meat lovers.
          </p>
        </div>
      </div>
    </footer>
  );
}
