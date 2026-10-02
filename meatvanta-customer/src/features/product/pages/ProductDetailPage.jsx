import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { fetchProduct } from "../api/productApi";
import { fetchProducts } from "../../shop/api/shopApi";
import { useCart } from "../../../hooks/useCart";
import { useCustomerAuth } from "../../../hooks/useCustomerAuth";
import { useDocumentMeta } from "../../../hooks/useDocumentMeta";
import { productImage } from "../../../lib/images";
import ProductGallery from "../components/ProductGallery";
import BannerSlot from "../../banners/components/BannerSlot";
import ProductBadges from "../../../components/product/ProductBadges";
import PriceLine from "../../../components/product/PriceLine";
import CouponHint from "../../../components/product/CouponHint";
import { variantDiscountPct } from "../../../lib/offers";
import ComboContents from "../components/ComboContents";
import RecipeCard from "../../recipes/components/RecipeCard";

const QUALITY_POINTS = [
  { icon: "verified", text: "100% Halal Certified" },
  { icon: "inventory_2", text: "Hygienically Packed" },
  { icon: "schedule", text: "Freshly Cut Each Morning" },
];

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { isAuthenticated, openLogin } = useCustomerAuth();

  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [selectedOptionIds, setSelectedOptionIds] = useState({});
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    setIsLoading(true);
    setNotFound(false);
    fetchProduct(id)
      .then((data) => {
        setProduct(data);
        const firstAvailable = data.variants.find((v) => v.isInStock);
        setSelectedVariantId(firstAvailable ? firstAvailable.id : null);
        setSelectedOptionIds({});
        setQuantity(1);

        fetchProducts({ categoryId: data.categoryId })
          .then((all) => setRelated(all.filter((p) => p.id !== data.id).slice(0, 4)))
          .catch(() => setRelated([]));
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [id]);

  const lowestVariantPrice = product?.variants?.length
    ? Math.min(...product.variants.map((v) => Number(v.price)))
    : null;

  useDocumentMeta({
    title: product ? product.name : undefined,
    description: product
      ? product.description ||
        `Buy fresh ${product.name}${
          product.category?.name ? ` (${product.category.name})` : ""
        } online${
          lowestVariantPrice !== null ? ` from ₹${lowestVariantPrice}` : ""
        } — halal, cut fresh every morning and delivered across Gurugram.`
      : undefined,
    path: product ? `/product/${product.id}` : undefined,
    image: product ? productImage(product, 1000) : undefined,
  });

  if (isLoading) {
    return <div className="page-x py-16 text-sm text-ink/60">Loading...</div>;
  }

  if (notFound || !product) {
    return (
      <div className="page-x py-20 text-center">
        <p className="font-display text-2xl font-bold text-ink mb-2">Product not found</p>
        <Link to="/shop" className="text-brand font-semibold underline">
          Back to shop
        </Link>
      </div>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);
  const hasAnyStock = product.variants.some((v) => v.isInStock);
  const optionGroups = product.optionGroups || [];

  const chosenOptions = optionGroups.flatMap((group) =>
    (group.options || []).filter((o) => (selectedOptionIds[group.id] || []).includes(o.id))
  );
  const optionsTotal = chosenOptions.reduce((sum, o) => sum + Number(o.extraPrice), 0);

  // Mirrors the server rule - a required group must be answered.
  const missingRequiredGroup = optionGroups.find(
    (group) => group.isRequired && (selectedOptionIds[group.id] || []).length === 0
  );

  const total = selectedVariant ? (Number(selectedVariant.price) + optionsTotal) * quantity : 0;

  function toggleOption(group, option) {
    setSelectedOptionIds((current) => {
      const currentIds = current[group.id] || [];
      if (group.allowMultiple) {
        return {
          ...current,
          [group.id]: currentIds.includes(option.id)
            ? currentIds.filter((oid) => oid !== option.id)
            : [...currentIds, option.id],
        };
      }
      const isSame = currentIds.includes(option.id);
      return { ...current, [group.id]: isSame && !group.isRequired ? [] : [option.id] };
    });
  }

  const addLabel = justAdded
    ? "Added ✓"
    : missingRequiredGroup
    ? `Choose ${missingRequiredGroup.name}`
    : "Add to Cart";

  function handleAddToCart() {
    if (!selectedVariant || missingRequiredGroup) return;
    addItem(product, selectedVariant, quantity, chosenOptions);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2200);
  }

  function handleBuyNow() {
    if (!selectedVariant || missingRequiredGroup) return;
    addItem(product, selectedVariant, quantity, chosenOptions);
    if (!isAuthenticated) {
      openLogin(() => navigate("/checkout"));
      return;
    }
    navigate("/checkout");
  }

  return (
    <div className="pb-20 md:pb-0">
      <div className="page-x py-4 md:py-6">
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-[11px] font-semibold uppercase tracking-wide text-ink/50 mb-4">
          <Link to="/" className="hover:text-brand">Home</Link>
          <span className="mx-2">/</span>
          <Link to={`/shop?category=${product.categoryId}`} className="hover:text-brand">
            {product.category?.name}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-[auto_minmax(0,1fr)] gap-6 lg:gap-10">
          {/* Images */}
          <ProductGallery
            images={product.images}
            fallbackSrc={productImage(product, 1000)}
            alt={`${product.name} — fresh ${product.category?.name} from Meat Vanta`}
          />

          {/* Details */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand mb-1.5">
              {product.category?.name}
            </p>
            <h1 className="font-display text-headline-lg text-ink mb-3">{product.name}</h1>
            <ProductBadges product={product} max={10} size="lg" withCountdown className="mb-3" />

            {selectedVariant && (
              <p className="mb-3 flex items-baseline gap-2 flex-wrap">
                <span className="font-display text-3xl font-bold text-ink">₹{total.toFixed(0)}</span>
                {variantDiscountPct(selectedVariant) !== null && (
                  <span className="text-base text-ink/40 line-through">
                    ₹{((Number(selectedVariant.mrp) + optionsTotal) * quantity).toFixed(0)}
                  </span>
                )}
                {optionsTotal > 0 && <span className="text-xs text-ink/50">includes ₹{optionsTotal} options</span>}
              </p>
            )}

            <span className="inline-flex items-center gap-1.5 bg-accent-soft/50 border border-accent/30 text-ink text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full mb-3">
              <span className="material-symbols-outlined text-sm text-accent">verified</span>
              Fresh Today
            </span>

            <CouponHint product={product} className="mb-3" />

            <ComboContents product={product} className="mb-4" />

            {product.description && (
              <p className="text-ink/70 leading-relaxed text-sm md:text-[15px] mb-4 pb-4 border-b border-hairline">
                {product.description}
              </p>
            )}

            {/* Weight */}
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-ink mb-2">{product.combo ? "Pack" : "Select Weight"}</h2>
              <div className="flex flex-wrap gap-2.5">
                {product.variants.map((variant) => {
                  const isSelected = variant.id === selectedVariantId;
                  return (
                    <button
                      key={variant.id}
                      disabled={!variant.isInStock}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`px-4 py-2.5 rounded-sm border text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        isSelected
                          ? "border-brand bg-brand text-white"
                          : "border-hairline bg-white text-ink hover:border-brand"
                      }`}
                    >
                      <span className="block text-xs font-bold uppercase tracking-wide">{variant.label}</span>
                      <span className={`block text-sm font-semibold ${isSelected ? "text-white" : "text-ink/70"}`}>
                        ₹{Number(variant.price)}
                        {variantDiscountPct(variant) !== null && (
                          <span className={`ml-1 text-xs font-normal line-through ${isSelected ? "text-white/70" : "text-ink/40"}`}>
                            ₹{Number(variant.mrp)}
                          </span>
                        )}
                      </span>
                      {variantDiscountPct(variant) !== null && (
                        <span className={`block text-[10px] font-bold ${isSelected ? "text-white" : "text-success"}`}>
                          {variantDiscountPct(variant)}% OFF
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Option groups */}
            {optionGroups.map((group) => (
              <div key={group.id} className="mb-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-lg font-bold text-ink">{group.name}</h2>
                  <span className={`text-xs font-semibold ${group.isRequired ? "text-brand" : "text-ink/50"}`}>
                    {group.isRequired ? "Required" : "Optional"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(group.options || []).map((option) => {
                    const isSelected = (selectedOptionIds[group.id] || []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        disabled={!option.isAvailable}
                        onClick={() => toggleOption(group, option)}
                        className={`px-4 py-2 rounded-sm border text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                          isSelected
                            ? "border-brand-dark bg-brand-dark text-white"
                            : "border-hairline bg-white text-ink hover:border-brand"
                        }`}
                      >
                        {option.name}
                        {Number(option.extraPrice) > 0 && (
                          <span className={`ml-1.5 ${isSelected ? "text-white/80" : "text-brand"}`}>
                            +₹{Number(option.extraPrice)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {hasAnyStock ? (
              <div className="flex flex-wrap items-center gap-3 mb-2">
                <div className="flex items-center border border-hairline rounded-full bg-white">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 flex items-center justify-center text-ink hover:text-brand"
                    aria-label="Decrease quantity"
                  >
                    <span className="material-symbols-outlined text-lg">remove</span>
                  </button>
                  <span className="w-8 text-center font-bold text-ink" aria-label="Quantity">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => q + 1)}
                    className="w-10 h-10 flex items-center justify-center text-ink hover:text-brand"
                    aria-label="Increase quantity"
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                  </button>
                </div>

                {/* Laptop / tablet: buttons sit right beside the quantity. */}
                <button
                  onClick={handleAddToCart}
                  disabled={!selectedVariant || !!missingRequiredGroup}
                  className="hidden md:flex items-center justify-center gap-2 border-2 border-brand text-brand font-semibold px-5 h-10 rounded-full hover:bg-brand/5 transition-colors disabled:opacity-40 text-sm"
                >
                  <span className="material-symbols-outlined text-lg">shopping_cart</span>
                  {addLabel}
                </button>
                <button
                  onClick={handleBuyNow}
                  disabled={!selectedVariant || !!missingRequiredGroup}
                  className="hidden md:flex items-center justify-center bg-brand text-white font-semibold px-7 h-10 rounded-full hover:bg-brand-dark transition-colors disabled:opacity-40 text-sm"
                >
                  Buy Now
                </button>
                {justAdded && (
                  <Link to="/cart" className="hidden md:inline text-sm font-semibold text-brand underline">
                    Go to cart
                  </Link>
                )}
              </div>
            ) : (
              <div className="bg-white border border-hairline rounded p-4 text-sm text-ink/70 mb-4">
                This item isn't available today. Please check back tomorrow morning.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Phones only: a slim bar so the buttons stay in reach while scrolling.
          On laptops the buttons sit beside the quantity instead (no strip). */}
      {hasAnyStock && (
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-hairline shadow-[0_-2px_10px_rgba(26,26,26,0.08)]">
          <div className="page-x py-2 flex items-center gap-2">
            <p className="font-display text-lg font-bold text-ink shrink-0 pr-1">₹{total.toFixed(0)}</p>
            <button
              onClick={handleAddToCart}
              disabled={!selectedVariant || !!missingRequiredGroup}
              className="flex-1 flex items-center justify-center gap-1 border-2 border-brand text-brand font-semibold h-10 rounded-full disabled:opacity-40 text-xs"
            >
              <span className="material-symbols-outlined text-base">shopping_cart</span>
              {addLabel}
            </button>
            <button
              onClick={handleBuyNow}
              disabled={!selectedVariant || !!missingRequiredGroup}
              className="flex-1 flex items-center justify-center bg-brand text-white font-semibold h-10 rounded-full disabled:opacity-40 text-xs"
            >
              Buy Now
            </button>
          </div>
        </div>
      )}

      {/* Assurance panels */}
      <div className="page-x py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded border border-hairline p-6">
            <h2 className="font-display text-lg font-bold text-ink mb-4 pb-3 border-b border-hairline">
              Quality Assurance
            </h2>
            <ul className="space-y-3">
              {QUALITY_POINTS.map((point) => (
                <li key={point.text} className="flex items-center gap-3 text-sm text-ink/75">
                  <span className="material-symbols-outlined text-accent text-xl">{point.icon}</span>
                  {point.text}
                </li>
              ))}
            </ul>
          </div>

          <div className="bg-white rounded border border-hairline p-6">
            <h2 className="font-display text-lg font-bold text-ink mb-4 pb-3 border-b border-hairline flex items-center gap-2">
              <span className="material-symbols-outlined text-brand">local_shipping</span>
              Delivery Slot
            </h2>
            <p className="text-sm font-semibold text-ink">Morning delivery, 6 AM – 11 AM</p>
            <p className="text-sm text-ink/60 mt-1">
              Choose your delivery date at checkout. Everything is cut fresh that morning.
            </p>
            <Link to="/delivery" className="inline-block text-sm font-semibold text-brand underline mt-3">
              Delivery information
            </Link>
          </div>
        </div>
      </div>

      {/* Offers - nothing renders when none are live */}
      <BannerSlot placement="product_page" className="pb-10" label="Offers" />

      {/* Recipes that use this product */}
      {product.recipes?.length > 0 && (
        <div className="page-x pb-14">
          <h2 className="font-display text-headline-md text-ink mb-1">Cook it with a recipe</h2>
          <p className="text-sm text-ink/60 mb-5">Step by step, with the flame and timings.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {product.recipes.map((r) => (
              <RecipeCard key={r.slug} recipe={r} />
            ))}
          </div>
        </div>
      )}

      {/* Related */}
      {related.length > 0 && (
        <div className="page-x pb-14">
          <h2 className="font-display text-headline-md text-ink mb-5">You may also like</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {related.map((item) => {
              const from = item.variants?.length
                ? Math.min(...item.variants.map((v) => Number(v.price)))
                : null;
              return (
                <Link
                  key={item.id}
                  to={`/product/${item.id}`}
                  className="group bg-white rounded border border-hairline overflow-hidden hover:border-brand/40 transition-colors flex flex-col h-full"
                >
                  <div className="relative aspect-square overflow-hidden bg-surface-alt">
                    <img
                      src={productImage(item)}
                      alt={`${item.name} — ${item.category?.name} from Meat Vanta`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <ProductBadges product={item} className="absolute top-3 left-3 right-3" />
                  </div>
                  <div className="p-4 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-ink/50">
                      {item.category?.name}
                    </p>
                    <h3 className="font-display font-bold text-ink leading-snug mt-0.5 line-clamp-2 min-h-[2.75rem]">{item.name}</h3>
                    {from !== null && <PriceLine product={item} className="mt-1" />}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}