import { NavLink } from "react-router-dom";
import { usePermission } from "../../hooks/usePermission";
import { useAuth } from "../../hooks/useAuth";
import BrandLogo from "../common/BrandLogo";

// One entry per feature - add the next feature's link here the same way
// once its pages exist, matching the backend's one-feature-at-a-time build order.
// hideWhenPreferenceFalse ties a nav item to a personal preference key (Settings page) -
// still requires the permission check to pass first; the preference only adds a further "hide".
const NAV_GROUPS = [
  {
    title: null,
    items: [{ label: "Dashboard", to: "/", icon: "dashboard", permission: null }],
  },
  {
    title: "Sales",
    items: [
      { label: "Orders", to: "/orders", icon: "receipt_long", permission: "orders:view" },
      { label: "Customers", to: "/customers", icon: "group", permission: "customers:view" },
      { label: "Delivery", to: "/delivery-settings", icon: "local_shipping", permission: "delivery_settings:view" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { label: "Categories", to: "/categories", icon: "category", permission: "categories:view" },
      { label: "Products", to: "/products", icon: "inventory_2", permission: "products:view" },
      { label: "Recipes", to: "/recipes", icon: "menu_book", permission: "recipes:view" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { label: "Offers & Banners", to: "/banners", icon: "campaign", permission: "banners:view" },
      { label: "Coupons", to: "/coupons", icon: "sell", permission: "coupons:view" },
    ],
  },
  {
    title: "Shop",
    items: [{ label: "Shop Info", to: "/shop-info", icon: "storefront", permission: "shop_info:view" }],
  },
  {
    title: "Admin",
    items: [
      { label: "Admin Users", to: "/admin-users", icon: "badge", permission: "admin_users:view" },
      { label: "Roles", to: "/roles", icon: "shield_person", permission: "roles:view" },
      { label: "Audit Log", to: "/audit-log", icon: "history", permission: "audit_log:view", preferenceKey: "showAuditLog" },
      { label: "Settings", to: "/settings", icon: "settings", permission: null },
    ],
  },
];

export default function Sidebar() {
  const { hasPermission } = usePermission();
  const { admin } = useAuth();

  // Same rules as before, applied per group; a group with nothing visible
  // (and so its heading) is dropped.
  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (item.permission && !hasPermission(item.permission)) return false;
      if (item.preferenceKey && admin?.preferences?.[item.preferenceKey] === false) return false;
      return true;
    }),
  })).filter((group) => group.items.length > 0);

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
      {/* Still scrolls, but the scrollbar itself is hidden. */}
      <div className="flex-1 pb-md overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {visibleGroups.map((group, index) => (
          <div key={group.title || index} className={index === 0 ? "pt-sm" : "pt-md"}>
            {group.title && (
              <p className="px-lg pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-accent/70">
                {group.title}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-md px-md py-2 border-l-4 transition-all duration-200 ${
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
        ))}
      </div>
    </nav>
  );
}