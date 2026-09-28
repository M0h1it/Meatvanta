import { useState, useEffect } from "react";
import { Link, NavLink, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useCart } from "../../hooks/useCart";
import { useCustomerAuth } from "../../hooks/useCustomerAuth";
import BrandLogo from "../common/BrandLogo";
import { useBanners } from "../../features/banners/useBanners";
import AnnouncementText from "../../features/banners/components/AnnouncementText";
import { useRecipes } from "../../features/recipes/useRecipes";

export default function Header() {
  const { totalCount } = useCart();
  const { customer, defaultAddress, isAuthenticated, openLogin } = useCustomerAuth();
  const announcements = useBanners("announcement");
  const hasAnnouncements = announcements.length > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { recipes } = useRecipes();

  // Keep the box in sync with the URL (back button, category click, direct link).
  useEffect(() => {
    setQuery(location.pathname === "/shop" ? searchParams.get("q") || "" : "");
  }, [location.pathname, searchParams]);

  // Close the mobile menu on navigation rather than leaving it open over
  // the new page.
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  function handleSearch(e) {
    e.preventDefault();
    const trimmed = query.trim();
    setMobileSearchOpen(false);
    navigate(trimmed ? `/shop?q=${encodeURIComponent(trimmed)}` : "/shop");
  }

  const navLinkClass = ({ isActive }) =>
    `text-sm font-semibold pb-0.5 border-b-2 transition-colors ${
      isActive ? "text-brand border-brand" : "text-ink/70 border-transparent hover:text-brand"
    }`;

  return (
    <header className="sticky top-0 z-40 bg-surface border-b border-hairline">
      {/* Top strip: offer announcements (admin-managed) + trust badges.
          Phones only see the strip when there is an announcement. */}
      <div className={`${hasAnnouncements ? "block" : "hidden sm:block"} bg-brand-dark text-white/90`}>
        <div
          className={`page-x flex items-center gap-4 py-1.5 text-[11px] font-medium tracking-wide ${
            hasAnnouncements ? "justify-center sm:justify-between" : "justify-end"
          }`}
        >
          <AnnouncementText announcements={announcements} />
          <span className="hidden sm:flex items-center gap-4 shrink-0">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">eco</span>
              Fresh
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">verified</span>
              Halal
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">ac_unit</span>
              No Frozen
            </span>
          </span>
        </div>
      </div>

      <div className="page-x">
        <div className="flex items-center gap-4 h-16">
          {/* LEFT - menu (mobile) + logo (the image already contains the wordmark) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setMobileMenuOpen((o) => !o)}
              className="md:hidden text-ink/70 hover:text-brand"
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              <span className="material-symbols-outlined">{mobileMenuOpen ? "close" : "menu"}</span>
            </button>
            <Link to="/" className="flex items-center">
              <BrandLogo className="h-10 md:h-12" />
            </Link>
          </div>

          {/* MIDDLE - navigation and search */}
          <div className="flex-1 flex items-center justify-center gap-6">
            <nav className="hidden md:flex items-center gap-6">
              <NavLink to="/" end className={navLinkClass}>
                Home
              </NavLink>
              <NavLink to="/shop" className={navLinkClass}>
                Shop
              </NavLink>
              {/* Only once a recipe is published */}
              {recipes.length > 0 && (
                <NavLink to="/recipes" className={navLinkClass}>
                  Recipes
                </NavLink>
              )}
              {isAuthenticated && (
                <NavLink to="/my-orders" className={navLinkClass}>
                  My Orders
                </NavLink>
              )}
              {/* Just "About Us" - a separate "Why Us" pointing at the same
                  /about route caused both links to show active together,
                  which just looked broken, and there's no dedicated Why Us
                  page yet to make it a real distinct link. */}
              <NavLink to="/about" className={navLinkClass}>
                About Us
              </NavLink>
              <NavLink to="/contact" className={navLinkClass}>
                Contact
              </NavLink>
            </nav>

            <form onSubmit={handleSearch} className="hidden lg:flex w-full max-w-xs">
              <div className="flex items-center w-full bg-white border border-hairline rounded-full px-4 py-2 focus-within:border-brand transition-colors">
                <span className="material-symbols-outlined text-lg text-ink/40">search</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search fresh cuts..."
                  aria-label="Search products"
                  className="flex-1 bg-transparent px-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none"
                />
              </div>
            </form>
          </div>

          {/* RIGHT - search toggle (small screens), account, cart */}
          <div className="flex items-center gap-3 sm:gap-4 shrink-0">
            <button
              onClick={() => setMobileSearchOpen((o) => !o)}
              className="lg:hidden text-ink/70 hover:text-brand"
              aria-label="Search"
            >
              <span className="material-symbols-outlined">search</span>
            </button>

            {isAuthenticated ? (
              <Link
                to="/account"
                className="flex items-center gap-1.5 text-ink/70 hover:text-brand transition-colors"
              >
                <span className="material-symbols-outlined">account_circle</span>
                <span className="hidden xl:inline text-sm font-semibold max-w-[90px] truncate">
                  {customer?.name?.split(" ")[0]}
                </span>
              </Link>
            ) : (
              <button
                onClick={() => openLogin()}
                className="text-sm font-semibold text-ink/70 hover:text-brand transition-colors"
              >
                Sign In
              </button>
            )}

            <Link to="/cart" className="relative flex items-center text-ink/70 hover:text-brand" aria-label="Cart">
              <span className="material-symbols-outlined">shopping_cart</span>
              {totalCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-brand text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                  {totalCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        {/* Mobile search drops to its own row rather than crowding the icons */}
        {mobileSearchOpen && (
          <form onSubmit={handleSearch} className="lg:hidden pb-3">
            <div className="flex items-center w-full bg-white border border-hairline rounded-full px-4 py-2.5">
              <span className="material-symbols-outlined text-lg text-ink/40">search</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search fresh cuts..."
                aria-label="Search products"
                className="flex-1 bg-transparent px-2 text-sm focus:outline-none"
              />
            </div>
          </form>
        )}

        {/* Mobile nav menu - the full nav list is hidden below md with no
            other way to reach About Us/Why Us/Contact/My Orders on a phone,
            so this hamburger panel is the only path to them there. */}
        {mobileMenuOpen && (
          <nav className="md:hidden pb-4 flex flex-col gap-1">
            <NavLink
              to="/"
              end
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                  isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                }`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/shop"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                  isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                }`
              }
            >
              Shop
            </NavLink>
            {recipes.length > 0 && (
              <NavLink
                to="/recipes"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                    isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                  }`
                }
              >
                Recipes
              </NavLink>
            )}
            {isAuthenticated && (
              <NavLink
                to="/my-orders"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                    isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                  }`
                }
              >
                My Orders
              </NavLink>
            )}
            <NavLink
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                  isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                }`
              }
            >
              About Us
            </NavLink>
            <NavLink
              to="/contact"
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `px-3 py-2.5 rounded-sm text-sm font-semibold ${
                  isActive ? "bg-brand/10 text-brand" : "text-ink/80 hover:bg-surface-alt"
                }`
              }
            >
              Contact
            </NavLink>
          </nav>
        )}
      </div>

      {/* Delivery address strip - signed-in only */}
      {isAuthenticated && (
        <div className="bg-brand-dark text-white/90">
          <Link to="/account" className="page-x flex items-center gap-1.5 py-1.5 hover:text-accent transition-colors">
            <span className="material-symbols-outlined text-base shrink-0">location_on</span>
            <span className="text-xs truncate">
              {defaultAddress ? (
                <>
                  <span className="font-bold text-white">{defaultAddress.label}</span>
                  {" · "}
                  {defaultAddress.addressLine}
                </>
              ) : (
                "Add a delivery address"
              )}
            </span>
            <span className="material-symbols-outlined text-sm shrink-0">expand_more</span>
          </Link>
        </div>
      )}
    </header>
  );
}