import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCategories, fetchProducts } from "../api/shopApi";
import { useDocumentMeta } from "../../../hooks/useDocumentMeta";
import { productImage } from "../../../lib/images";
import BannerSlot from "../../banners/components/BannerSlot";
import ProductBadges from "../../../components/product/ProductBadges";
import PriceLine from "../../../components/product/PriceLine";

function lowestPrice(product) {
  if (!product?.variants?.length) return null;
  return Math.min(...product.variants.map((v) => Number(v.price)));
}

export default function ShopPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get("category") || "";
  const searchQuery = searchParams.get("q") || "";

  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    setIsLoading(true);
    fetchProducts({
      categoryId: activeCategory || undefined,
      search: searchQuery || undefined,
    })
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false));
  }, [activeCategory, searchQuery]);

  // Category and search compose - picking a category keeps the search term.
  function selectCategory(categoryId) {
    const next = {};
    if (categoryId) next.category = categoryId;
    if (searchQuery) next.q = searchQuery;
    setSearchParams(next);
  }

  function clearSearch() {
    const next = {};
    if (activeCategory) next.category = activeCategory;
    setSearchParams(next);
  }

  const activeCategoryName = categories.find(
    (category) => String(category.id) === activeCategory
  )?.name;

  useDocumentMeta({
    title: searchQuery
      ? `Search results for "${searchQuery}"`
      : activeCategoryName
      ? `${activeCategoryName} — Shop Fresh Halal Meat`
      : "Shop Fresh Halal Meat Online",
    description: searchQuery
      ? `Search results for "${searchQuery}" — fresh halal chicken, mutton and kebabs delivered across Gurugram.`
      : activeCategoryName
      ? `Order fresh ${activeCategoryName.toLowerCase()} online, cut fresh every morning and delivered across Gurugram, 6 AM to 11 AM.`
      : "Browse fresh halal chicken, mutton, kebabs and more — cut fresh every morning and delivered across Gurugram, 6 AM to 11 AM.",
    path: "/shop",
  });

  const pillClass = (isActive) =>
    `whitespace-nowrap text-xs font-bold uppercase tracking-wide px-5 py-2.5 rounded-full border transition-colors ${
      isActive
        ? "bg-brand text-white border-brand"
        : "bg-white text-ink border-hairline hover:border-brand"
    }`;

  return (
    <div className="page-x py-8 md:py-12">
      {searchQuery ? (
        <div className="mb-6">
          <h1 className="font-display text-headline-lg text-ink">
            Results for "{searchQuery}"
          </h1>
          <button onClick={clearSearch} className="text-sm font-semibold text-brand underline mt-1">
            Clear search
          </button>
        </div>
      ) : (
        <div className="mb-6">
          <h1 className="font-display text-headline-lg text-ink">Shop Fresh</h1>
          <p className="text-ink/60 text-sm mt-1">Hand-picked cuts delivered to your doorstep.</p>
        </div>
      )}

      {/* Offers - nothing renders when none are live */}
      <BannerSlot placement="shop_top" inset="inside" className="mb-6" label="Offers" />

      {/* Category pills */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 mb-6 -mx-gutter px-gutter md:mx-0 md:px-0">
        <button onClick={() => selectCategory("")} className={pillClass(activeCategory === "")}>
          All
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => selectCategory(String(category.id))}
            className={pillClass(activeCategory === String(category.id))}
          >
            {category.name}
          </button>
        ))}
      </div>

      {!isLoading && products.length > 0 && (
        <p className="text-sm text-ink/60 border-b border-hairline pb-3 mb-6">
          {products.length} {products.length === 1 ? "Product" : "Products"}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-ink/60">Loading fresh cuts...</p>
      ) : products.length === 0 ? (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-ink/20 mb-3">
            {searchQuery ? "search_off" : "inventory_2"}
          </span>
          <p className="font-display text-xl font-bold text-ink mb-1">
            {searchQuery ? `Nothing found for "${searchQuery}"` : "Nothing here right now"}
          </p>
          <p className="text-sm text-ink/60">
            {searchQuery
              ? "Try a different word, or browse the categories above."
              : "No products available in this category today."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
          {products.map((product) => {
            const from = lowestPrice(product);
            const availableWeights = product.variants.filter((v) => v.isInStock).length;
            const isUnavailable = availableWeights === 0;

            return (
              <Link
                key={product.id}
                to={`/product/${product.id}`}
                className={`group bg-white rounded border border-hairline overflow-hidden flex flex-col transition-colors ${
                  isUnavailable ? "opacity-70" : "hover:border-brand/40"
                }`}
              >
                <div className="relative aspect-square overflow-hidden bg-surface-alt">
                  <img
                    src={productImage(product)}
                    alt={`${product.name} — fresh ${product.category?.name} from Meat Vanta`}
                    className={`w-full h-full object-cover transition-transform duration-500 ${
                      isUnavailable ? "grayscale" : "group-hover:scale-105"
                    }`}
                  />
                  <span className="absolute top-3 left-3 bg-brand-dark text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-sm">
                    {product.category?.name}
                  </span>
                  {!isUnavailable && <ProductBadges product={product} className="absolute bottom-3 left-3 right-3" />}
                  {isUnavailable && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-white text-ink text-xs font-semibold px-4 py-2 rounded-full shadow-sm">
                        Not available today
                      </span>
                    </span>
                  )}
                </div>

                <div className="p-4 flex-1 flex flex-col">
                  <h2 className="font-display font-bold text-ink leading-snug">{product.name}</h2>
                  {from !== null && <PriceLine product={product} className="mt-1" />}
                  <p
                    className={`text-xs mt-auto pt-3 border-t border-hairline ${
                      isUnavailable ? "text-brand" : "text-ink/50"
                    }`}
                  >
                    {isUnavailable
                      ? "Currently Unavailable"
                      : product.combo
                      ? `Combo · ${product.combo.items.length} ${product.combo.items.length === 1 ? "item" : "items"} inside`
                      : `${availableWeights} ${availableWeights === 1 ? "weight" : "weights"} available`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
