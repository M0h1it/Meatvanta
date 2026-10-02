import { useLocation } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import Header from "./Header";
import SideCart from "./SideCart";
import Footer from "./Footer";
import OfferPopup from "../../features/banners/components/OfferPopup";

export default function Layout({ children }) {
  const { pathname } = useLocation();
  const { items } = useCart();
  // The slim side cart (laptop only) belongs on browsing pages, not the cart/checkout themselves.
  const showSideCart = (pathname === "/shop" || pathname.startsWith("/product/")) && items.length > 0;
  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink">
      <Header />
      {/* No max-width wrapper - pages run edge to edge and manage their own
          gutters via the .page-x utility. */}
      <main className={`flex-1 ${showSideCart ? "lg:pr-28" : ""}`}>{children}</main>
      {showSideCart && <SideCart />}
      <Footer />
      {/* Pop-up offer: once per visit, only when one is live */}
      <OfferPopup />
    </div>
  );
}
