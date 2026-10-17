import { NavLink } from "react-router-dom";
import { usePermission } from "../../hooks/usePermission";

// Mirrors Sidebar's items - mobile gets icon-only bottom nav instead of a
// collapsible drawer, simplest touch-friendly pattern for a small nav set.
const NAV_ITEMS = [
  { label: "Home", to: "/", icon: "dashboard", permission: "orders:view" },
  { label: "Deliveries", to: "/my-deliveries", icon: "moped", permission: "delivery:view" },
  { label: "Orders", to: "/orders", icon: "receipt_long", permission: "orders:view" },
  { label: "Board", to: "/delivery-board", icon: "pin_drop", permission: "orders:view" },
  { label: "Categories", to: "/categories", icon: "category", permission: "categories:view" },
  { label: "Products", to: "/products", icon: "inventory_2", permission: "products:view" },
  { label: "Settings", to: "/settings", icon: "settings", permission: null },
];

export default function BottomNav() {
  const { hasPermission } = usePermission();
  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission));

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-container-lowest border-t border-outline-variant flex z-50">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 ${
              isActive ? "text-primary" : "text-on-surface-variant"
            }`
          }
        >
          <span className="material-symbols-outlined text-xl">{item.icon}</span>
          <span className="text-[10px] font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
