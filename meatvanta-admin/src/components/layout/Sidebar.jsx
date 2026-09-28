import { NavLink } from "react-router-dom";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../hooks/useAuth";
import BrandLogo from "../common/BrandLogo";

// One entry per feature - add the next feature's link here the same way
// once its pages exist, matching the backend's one-feature-at-a-time build order.
// hideWhenPreferenceFalse ties a nav item to a personal preference key (Settings page) -
// still requires the permission check to pass first; the preference only adds a further "hide".
const NAV_ITEMS = [
  { label: "Dashboard", to: "/", icon: "dashboard", permission: null },
  { label: "Orders", to: "/orders", icon: "receipt_long", permission: "orders:view" },
  { label: "Customers", to: "/customers", icon: "group", permission: "customers:view" },
  { label: "Delivery", to: "/delivery-settings", icon: "local_shipping", permission: "delivery_settings:view" },
  { label: "Categories", to: "/categories", icon: "category", permission: "categories:view" },
  { label: "Products", to: "/products", icon: "inventory_2", permission: "products:view" },
  { label: "Offers & Banners", to: "/banners", icon: "campaign", permission: "banners:view" },
  { label: "Coupons", to: "/coupons", icon: "sell", permission: "coupons:view" },
  { label: "Recipes", to: "/recipes", icon: "menu_book", permission: "recipes:view" },
  { label: "Roles", to: "/roles", icon: "shield_person", permission: "roles:view" },
  { label: "Admin Users", to: "/admin-users", icon: "badge", permission: "admin_users:view" },
  { label: "Audit Log", to: "/audit-log", icon: "history", permission: "audit_log:view", preferenceKey: "showAuditLog" },
  { label: "Shop Info", to: "/shop-info", icon: "storefront", permission: "shop_info:view" },
  { label: "Settings", to: "/settings", icon: "settings", permission: null },
];

export default function Sidebar() {
  const { hasPermission } = usePermission();
  const { admin } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.permission && !hasPermission(item.permission)) return false;
    if (item.preferenceKey && admin?.preferences?.[item.preferenceKey] === false) return false;
    return true;
  });

  return (
    <nav className="hidden md:flex fixed left-0 top-0 h-full w-sidebar-width flex-col border-r border-outline-variant bg-secondary z-50">
      <div className="p-lg flex items-center gap-3 border-b border-accent/25">
        <BrandLogo className="h-11 w-11" />
        <div>
          <h1 className="text-headline-sm font-headline-sm font-bold text-surface-container-lowest leading-tight">
            Meat Vanta
          </h1>
          <p className="text-xs text-accent font-medium">Admin Portal</p>
        </div>
      </div>
      <div className="flex-1 mt-sm overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-md px-md py-sm border-l-4 transition-all duration-200 ${
                isActive
                  ? "border-primary bg-white/10 text-surface-container-lowest"
                  : "border-transparent text-surface-container-high/70 hover:text-surface-container-lowest hover:bg-white/5"
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">{item.icon}</span>
            <span className="font-label-bold text-label-bold">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
