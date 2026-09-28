import { Link } from "react-router-dom";
import { useShopInfo } from "../../hooks/useShopInfo";
import BrandLogo from "../common/BrandLogo";

const SOCIALS = [
  { key: "facebook", icon: "thumb_up" },
  { key: "instagram", icon: "photo_camera" },
  { key: "youtube", icon: "smart_display" },
];

export default function Footer() {
  const { shopInfo } = useShopInfo();

  const shopName = shopInfo?.shopName || "Meat Vanta";
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

            {/* Socials - only WhatsApp is backed by real data today; the rest
                are placeholders until social links are added to Shop Info. */}
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
              {SOCIALS.map((s) => (
                <span
                  key={s.key}
                  title="Coming soon"
                  className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-white/40 cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-base">{s.icon}</span>
                </span>
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
            Made with <span className="text-brand">❤</span> for meat lovers.
          </p>
        </div>
      </div>
    </footer>
  );
}
