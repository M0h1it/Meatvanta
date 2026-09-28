import Header from "./Header";
import Footer from "./Footer";
import OfferPopup from "../../features/banners/components/OfferPopup";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink">
      <Header />
      {/* No max-width wrapper - pages run edge to edge and manage their own
          gutters via the .page-x utility. */}
      <main className="flex-1">{children}</main>
      <Footer />
      {/* Pop-up offer: once per visit, only when one is live */}
      <OfferPopup />
    </div>
  );
}
