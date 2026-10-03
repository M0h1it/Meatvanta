import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories, fetchProducts } from "../../shop/api/shopApi";
import CategorySlider from "../components/CategorySlider";
import { productImage } from "../../../lib/images";
import BannerSlot from "../../banners/components/BannerSlot";
import { useRecipes } from "../../recipes/useRecipes";
import RecipeCard from "../../recipes/components/RecipeCard";
import ProductBadges from "../../../components/product/ProductBadges";
import PriceLine from "../../../components/product/PriceLine";

const TRUST_STRIP = [
  { icon: "eco", title: "Fresh & Hygienic", text: "Pure, clean and safe" },
  { icon: "calendar_month", title: "Daily Cut", text: "Always fresh" },
  { icon: "noFrozen", title: "No Frozen", text: "100% fresh meat" },
  { icon: "verified", title: "Halal Certified", text: "As per Islamic guidelines" },
  { icon: "verified_user", title: "Premium Quality", text: "For your family's health" },
];

const WHY_TRUST = [
  { icon: "eco", title: "100% Fresh", sub: "& Natural", filled: true },
  { icon: "verified_user", title: "Hygienically", sub: "Processed" },
  { icon: "favorite", title: "Your Health", sub: "Our Priority" },
  { icon: "groups", title: "Trusted by", sub: "Families" },
];

function lowestPrice(product) {
  if (!product?.variants?.length) return null;
  return Math.min(...product.variants.map((v) => Number(v.price)));
}

export default function HomePage() {
  const [categories, setCategories] = useState([]);
  const [bestSellers, setBestSellers] = useState([]);
  const { recipes } = useRecipes();

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
    fetchProducts()
      .then((all) => setBestSellers(all.slice(0, 4)))
      .catch(() => setBestSellers([]));
  }, []);


  return (
    <div className="overflow-hidden">
      {/* OFFERS - top slider. Renders nothing when no offer is live. */}
      <BannerSlot placement="home_top" className="pt-4 md:pt-6" eager label="Offers" />

      {/* HERO - background photo only (no text baked in), so all copy below
          is real, editable JSX text positioned over the blank area the
          photo leaves for it. Desktop and mobile use separate crops, each
          locked to its exact aspect ratio so the text sits in the right
          spot at any screen width. */}
      <section className="relative bg-surface">
        {/* Desktop / tablet. Both versions are loading="lazy": the browser then
            only downloads the one that is actually visible (a hidden image
            with normal loading still downloads - phones used to fetch the
            desktop photo too). */}
        <div className="hidden md:block relative w-full aspect-[1944/809] overflow-hidden">
          <img
            src="/hero-desktop.webp"
            loading="lazy"
            decoding="async"
            alt="Premium mutton and chicken cuts on a wooden board, Halal certified"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center">
            <div className="w-[46%] pl-[4%] pr-4">
              <div className="flex items-center gap-2 mb-2 lg:mb-3">
                <span className="w-6 lg:w-8 h-px bg-accent" />
                <span className="text-brand text-[11px] lg:text-xs font-bold uppercase tracking-[0.2em]">
                  Premium Quality
                </span>
                <span className="w-6 lg:w-8 h-px bg-accent" />
              </div>
              <h1 className="font-display leading-[1.05] mb-3 lg:mb-4 text-[clamp(1.5rem,3.4vw,3rem)]">
                <span className="text-brand font-extrabold">Fresh Halal Meat</span>
                <br />
                <span className="text-accent font-extrabold">for a Healthier You</span>
              </h1>
              <p className="text-ink/70 text-[clamp(0.7rem,1.1vw,1rem)] leading-snug mb-4 lg:mb-6 max-w-md">
                At Meatvanta, we bring you the freshest mutton and chicken, carefully sourced and cut daily for
                your family's happiness.
              </p>
              <Link
                to="/shop"
                className="inline-flex items-center gap-2 bg-brand text-white font-bold px-5 lg:px-8 py-2 lg:py-3.5 rounded-full hover:bg-brand-dark transition-colors text-xs lg:text-base shadow-lg"
              >
                Shop Now
                <span className="material-symbols-outlined text-base lg:text-xl">arrow_forward</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Mobile */}
        <div className="md:hidden relative w-full aspect-[1024/1536] overflow-hidden">
          <img
            src="/hero-mobile.webp"
            loading="lazy"
            decoding="async"
            alt="Premium mutton and chicken cuts on a wooden board, Halal certified"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 top-[4%] text-center px-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="w-6 h-px bg-accent" />
              <span className="text-brand text-[11px] font-bold uppercase tracking-[0.2em]">Premium Quality</span>
              <span className="w-6 h-px bg-accent" />
            </div>
            <h1 className="font-display leading-[1.05] mb-3 text-[clamp(1.75rem,7vw,2.5rem)]">
              <span className="text-brand font-extrabold">Fresh Meat</span>
              <br />
              <span className="text-accent font-extrabold">for a Healthier You</span>
            </h1>
            <p className="text-ink/70 text-sm leading-snug mb-4 max-w-xs mx-auto">
              At Meatvanta, we bring you the freshest mutton and chicken, carefully sourced and cut daily for
              your family's happiness.
            </p>
          </div>

          <Link
            to="/shop"
            className="absolute left-1/2 -translate-x-1/2 top-[38%] inline-flex items-center gap-2 bg-brand text-white font-bold px-7 py-3 rounded-full hover:bg-brand-dark transition-colors text-sm shadow-lg"
          >
            Shop Now
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* TRUST STRIP */}
      <section className="bg-white border-y border-hairline">
        <div className="page-x py-8">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-y-6 sm:divide-x sm:divide-hairline text-center">
            {TRUST_STRIP.map((point) => (
              <div key={point.title} className="flex flex-col items-center gap-2 px-2">
                {point.icon === "noFrozen" ? (
                  // No off-the-shelf "no frozen" icon exists, so this is a
                  // snowflake composited inside a prohibition circle.
                  <span className="relative w-11 h-11 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-[2.5px] border-brand" />
                    <span className="absolute left-1/2 top-1/2 w-[2.5px] h-11 bg-brand -translate-x-1/2 -translate-y-1/2 rotate-45" />
                    <span
                      className="material-symbols-outlined text-brand text-xl"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      ac_unit
                    </span>
                  </span>
                ) : (
                  <span
                    className="material-symbols-outlined text-brand text-4xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {point.icon}
                  </span>
                )}
                <p className="font-bold text-brand-dark text-sm">{point.title}</p>
                <p className="text-xs text-ink/50">{point.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SHOP BY CATEGORY - every active category from admin, in a slider.
          Nothing renders until there is at least one. */}
      {categories.length > 0 && (
        <section className="page-x py-14 md:py-section">
          <div className="text-center mb-8 md:mb-10">
            <div className="flex items-center justify-center gap-3 text-accent text-xs font-bold uppercase tracking-[0.2em] mb-2">
              <span className="w-8 h-px bg-accent" /> Shop by Category <span className="w-8 h-px bg-accent" />
            </div>
            <h2 className="font-display text-headline-lg text-brand">Choose Your Meat</h2>
          </div>

          <CategorySlider categories={categories} />
        </section>
      )}

      {/* OFFERS - after categories */}
      <BannerSlot placement="home_middle" className="pb-14 md:pb-16" label="Offers" />

      {/* WHY CHOOSE MEATVANTA */}
      <section className="bg-white border-y border-hairline">
        <div className="page-x py-14 md:py-[50px]">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 text-accent text-xs font-bold uppercase tracking-[0.2em] mb-2">
              <span className="w-8 h-px bg-accent" /> Why Choose Meatvanta <span className="w-8 h-px bg-accent" />
            </div>
            <h2 className="font-display text-headline-lg text-ink">
              Good Meat. <span className="text-brand">Greater Trust.</span>
            </h2>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-y-8 sm:divide-x sm:divide-hairline text-center">
            {WHY_TRUST.map((item) => (
              <div key={item.title} className="flex flex-col items-center gap-2 px-2">
                <span
                  className="material-symbols-outlined text-brand text-4xl"
                  style={item.filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <p className="font-bold text-brand text-sm leading-tight">
                  {item.title}
                  <br />
                  {item.sub}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OFFERS - above best sellers */}
      <BannerSlot placement="home_bottom" className="pt-14 md:pt-16" label="Offers" />

      {/* FEATURED PRODUCTS */}
      {bestSellers.length > 0 && (
        <section className="page-x py-14 md:py-section">
          <div className="text-center mb-10">
            <div className="flex items-center justify-center gap-3 text-accent text-xs font-bold uppercase tracking-[0.2em] mb-2">
              <span className="w-8 h-px bg-accent" /> Featured Products <span className="w-8 h-px bg-accent" />
            </div>
            <h2 className="font-display text-headline-lg text-brand">Fresh Picks for You</h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {bestSellers.map((product) => (
              <div key={product.id} className="bg-white rounded border border-hairline overflow-hidden flex flex-col h-full">
                <Link to={`/product/${product.id}`} className="block relative aspect-square overflow-hidden bg-surface-alt group">
                  <img
                    src={productImage(product)}
                    alt={`${product.name} — ${product.category?.name} at Meat Vanta`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <ProductBadges product={product} className="absolute top-3 left-3 right-3" />
                </Link>
                <div className="p-4 flex-1 flex flex-col">
                  <Link to={`/product/${product.id}`}>
                    <h3 className="font-semibold text-ink text-sm hover:text-brand-dark transition-colors line-clamp-2 min-h-[2.5rem]">
                      {product.name}
                    </h3>
                  </Link>
                  <PriceLine product={product} className="mt-0.5 mb-3 mt-auto" />
                  <Link
                    to={`/product/${product.id}`}
                    className="flex items-center justify-center gap-1.5 w-full bg-brand text-white text-sm font-bold py-2 rounded-full hover:bg-brand-dark transition-colors"
                  >
                    <span className="material-symbols-outlined text-base">shopping_cart</span>
                    Add to Cart
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* RECIPES - only when at least one is published */}
      {recipes.length > 0 && (
        <section className="page-x pb-14 md:pb-section">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <div className="flex items-center gap-3 text-accent text-xs font-bold uppercase tracking-[0.2em] mb-2">
                <span className="w-8 h-px bg-accent" /> Recipes
              </div>
              <h2 className="font-display text-headline-lg text-brand">Cook It Right</h2>
            </div>
            <Link to="/recipes" className="text-sm font-semibold text-brand underline">
              All recipes
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recipes.slice(0, 3).map((r) => (
              <RecipeCard key={r.slug} recipe={r} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}