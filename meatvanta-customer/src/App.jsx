import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/layout/Layout";
import LoginSheet from "./features/auth/components/LoginSheet";
import ScrollToTop from "./components/common/ScrollToTop";

import HomePage from "./features/home/pages/HomePage";
import ShopPage from "./features/shop/pages/ShopPage";
import ProductDetailPage from "./features/product/pages/ProductDetailPage";
import CartPage from "./features/cart/pages/CartPage";
import CheckoutPage from "./features/checkout/pages/CheckoutPage";
import OrderConfirmationPage from "./features/orders/pages/OrderConfirmationPage";
import MyOrdersPage from "./features/orders/pages/MyOrdersPage";
import MyOrderDetailPage from "./features/orders/pages/MyOrderDetailPage";
import AccountPage from "./features/account/pages/AccountPage";
import AboutPage from "./features/content/pages/AboutPage";
import ContactPage from "./features/content/pages/ContactPage";
import FaqPage from "./features/content/pages/FaqPage";
import DeliveryInfoPage from "./features/content/pages/DeliveryInfoPage";
import RecipesPage from "./features/recipes/pages/RecipesPage";
import RecipeDetailPage from "./features/recipes/pages/RecipeDetailPage";

export default function App() {
  return (
    <Layout>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/shop" element={<ShopPage />} />
        <Route path="/product/:id" element={<ProductDetailPage />} />
        <Route path="/recipes" element={<RecipesPage />} />
        <Route path="/recipes/:slug" element={<RecipeDetailPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
        {/* Sign-in is required at the cart, so every web order belongs to an
            account - there is nothing left for a lookup form to do. */}
        <Route path="/track" element={<Navigate to="/my-orders" replace />} />
        <Route path="/my-orders" element={<MyOrdersPage />} />
        <Route path="/my-orders/:orderNumber" element={<MyOrderDetailPage />} />
        <Route path="/account" element={<AccountPage />} />

        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/faq" element={<FaqPage />} />
        <Route path="/delivery" element={<DeliveryInfoPage />} />
      </Routes>

      {/* Global - any page can trigger it via openLogin() */}
      <LoginSheet />
    </Layout>
  );
}
