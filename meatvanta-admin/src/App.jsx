import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { usePermission } from "./hooks/usePermission";
import ProtectedRoute from "./components/common/ProtectedRoute";
import AdminLayout from "./components/layout/AdminLayout";

import LoginPage from "./features/auth/pages/LoginPage";
import ForgotPasswordPage from "./features/auth/pages/ForgotPasswordPage";
import DashboardPage from "./features/dashboard/pages/DashboardPage";
import CategoriesPage from "./features/categories/pages/CategoriesPage";
import ProductsPage from "./features/products/pages/ProductsPage";
import RolesPage from "./features/roles/pages/RolesPage";
import AdminUsersPage from "./features/adminUsers/pages/AdminUsersPage";
import AuditLogPage from "./features/auditLog/pages/AuditLogPage";
import OrdersPage from "./features/orders/pages/OrdersPage";
import SettingsPage from "./features/settings/pages/SettingsPage";
import ShopInfoPage from "./features/shopInfo/pages/ShopInfoPage";
import DeliverySettingsPage from "./features/deliverySettings/pages/DeliverySettingsPage";
import OrderDetailPage from "./features/orders/pages/OrderDetailPage";
import ProductDetailPage from "./features/products/pages/ProductDetailPage";
import CustomersPage from "./features/customers/pages/CustomersPage";
import CustomerDetailPage from "./features/customers/pages/CustomerDetailPage";
import MyDeliveriesPage from "./features/delivery/pages/MyDeliveriesPage";
import DeliveryBoardPage from "./features/delivery/pages/DeliveryBoardPage";
import RiderCashPage from "./features/delivery/pages/RiderCashPage";
import WalletPage from "./features/wallet/pages/WalletPage";

// Loaded on first visit to keep the main bundle small.
const BannersPage = lazy(() => import("./features/banners/pages/BannersPage"));
const CouponsPage = lazy(() => import("./features/coupons/pages/CouponsPage"));
const RecipesPage = lazy(() => import("./features/recipes/pages/RecipesPage"));
const RecipeEditorPage = lazy(() => import("./features/recipes/pages/RecipeEditorPage"));
const pageFallback = <p className="text-sm text-on-surface-variant">Loading…</p>;

// A delivery rider (has delivery access, cannot see orders) lands on their own page, not the shop dashboard.
function HomeRoute() {
  const { admin } = useAuth();
  const { hasPermission } = usePermission();
  if (admin && !hasPermission("orders:view") && hasPermission("delivery:view")) {
    return <Navigate to="/my-deliveries" replace />;
  }
  return <DashboardPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <HomeRoute />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/my-deliveries"
        element={
          <ProtectedRoute requiredPermission="delivery:view">
            <AdminLayout>
              <MyDeliveriesPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/delivery-board"
        element={
          <ProtectedRoute requiredPermission="orders:view">
            <AdminLayout>
              <DeliveryBoardPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rider-cash"
        element={
          <ProtectedRoute requiredPermission="delivery:settle">
            <AdminLayout>
              <RiderCashPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/wallet"
        element={
          <ProtectedRoute requiredPermission="reports:view">
            <AdminLayout>
              <WalletPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/categories"
        element={
          <ProtectedRoute requiredPermission="categories:view">
            <AdminLayout>
              <CategoriesPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/products"
        element={
          <ProtectedRoute requiredPermission="products:view">
            <AdminLayout>
              <ProductsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/roles"
        element={
          <ProtectedRoute requiredPermission="roles:view">
            <AdminLayout>
              <RolesPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin-users"
        element={
          <ProtectedRoute requiredPermission="admin_users:view">
            <AdminLayout>
              <AdminUsersPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/audit-log"
        element={
          <ProtectedRoute requiredPermission="audit_log:view">
            <AdminLayout>
              <AuditLogPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders"
        element={
          <ProtectedRoute requiredPermission="orders:view">
            <AdminLayout>
              <OrdersPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AdminLayout>
              <SettingsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/delivery-settings"
        element={
          <ProtectedRoute requiredPermission="delivery_settings:view">
            <AdminLayout>
              <DeliverySettingsPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/orders/:id"
        element={
          <ProtectedRoute requiredPermission="orders:view">
            <AdminLayout>
              <OrderDetailPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers"
        element={
          <ProtectedRoute requiredPermission="customers:view">
            <AdminLayout>
              <CustomersPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/customers/:id"
        element={
          <ProtectedRoute requiredPermission="customers:view">
            <AdminLayout>
              <CustomerDetailPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/products/:id"
        element={
          <ProtectedRoute requiredPermission="products:view">
            <AdminLayout>
              <ProductDetailPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/coupons"
        element={
          <ProtectedRoute requiredPermission="coupons:view">
            <AdminLayout>
              <Suspense fallback={pageFallback}>
                <CouponsPage />
              </Suspense>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recipes"
        element={
          <ProtectedRoute requiredPermission="recipes:view">
            <AdminLayout>
              <Suspense fallback={pageFallback}>
                <RecipesPage />
              </Suspense>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/recipes/:id"
        element={
          <ProtectedRoute requiredPermission="recipes:view">
            <AdminLayout>
              <Suspense fallback={pageFallback}>
                <RecipeEditorPage />
              </Suspense>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/banners"
        element={
          <ProtectedRoute requiredPermission="banners:view">
            <AdminLayout>
              <Suspense fallback={pageFallback}>
                <BannersPage />
              </Suspense>
            </AdminLayout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/shop-info"
        element={
          <ProtectedRoute requiredPermission="shop_info:view">
            <AdminLayout>
              <ShopInfoPage />
            </AdminLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}