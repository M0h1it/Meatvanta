import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../hooks/useAuth";
import { fetchDashboardStats, fetchOrders } from "../../orders/api/ordersApi";
import { usePermission } from "../../../hooks/usePermission";

// Loaded only when the Analytics tab is opened, so the charting libraries
// don't slow down the everyday "Today" view.
const AnalyticsView = lazy(() => import("../../analytics/pages/AnalyticsView"));

const STATUS_LABELS = {
  placed: "Placed",
  preparing: "Preparing",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function DashboardPage() {
  const { admin } = useAuth();
  const { hasPermission } = usePermission();
  const canViewAnalytics = hasPermission("reports:view");
  const [searchParams, setSearchParams] = useSearchParams();
  // The tab lives in the URL (?tab=analytics) so a refresh or shared link keeps it.
  const tab = canViewAnalytics && searchParams.get("tab") === "analytics" ? "analytics" : "today";

  function selectTab(next) {
    setSearchParams(next === "analytics" ? { tab: "analytics" } : {}, { replace: true });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-md text-headline-md text-on-surface">Welcome back, {admin?.name}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-1">
            {tab === "today" ? "Here's an overview of your store today." : "Sales, orders and best sellers over time."}
          </p>
        </div>

        {canViewAnalytics && (
          <div role="tablist" aria-label="Dashboard view" className="inline-flex rounded border border-outline-variant overflow-hidden">
            {[
              { id: "today", label: "Today", icon: "today" },
              { id: "analytics", label: "Analytics", icon: "monitoring" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => selectTab(t.id)}
                className={`flex items-center gap-1.5 text-sm px-4 py-2 border-l first:border-l-0 border-outline-variant transition-colors ${
                  tab === t.id
                    ? "bg-primary-container text-on-primary"
                    : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                <span className="material-symbols-outlined text-lg leading-none">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "analytics" ? (
        <Suspense fallback={<p className="text-sm text-on-surface-variant py-lg">Loading analytics…</p>}>
          <AnalyticsView />
        </Suspense>
      ) : (
        <TodayView />
      )}
    </div>
  );
}

/** The original dashboard: today's numbers and the latest orders. Unchanged. */
function TodayView() {
  const { hasPermission } = usePermission();
  const canViewOrders = hasPermission("orders:view");

  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const statsData = await fetchDashboardStats();
        setStats(statsData);
        if (canViewOrders) {
          const ordersResult = await fetchOrders({ page: 1, pageSize: 5 });
          setRecentOrders(ordersResult.orders);
        }
      } catch {
        // Dashboard is best-effort - a failed stats call shouldn't block the page.
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [canViewOrders]);

  const statCards = [
    { label: "Today's Orders", icon: "shopping_cart", value: stats?.todayOrdersCount },
    { label: "Pending", icon: "pending_actions", value: stats?.pendingCount },
    { label: "Today's Revenue", icon: "payments", value: stats ? `₹${Number(stats.todayRevenue).toFixed(2)}` : undefined },
    { label: "Total Customers", icon: "group", value: stats?.totalCustomers },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        {statCards.map((card) => (
          <div key={card.label} className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
            <span className="material-symbols-outlined text-on-surface-variant">{card.icon}</span>
            <p className="font-headline-sm text-headline-sm text-on-surface mt-2">
              {isLoading ? "—" : card.value ?? "—"}
            </p>
            <p className="text-xs text-on-surface-variant mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {canViewOrders && (
        <div className="bg-surface-container-lowest rounded-lg border border-outline-variant overflow-hidden">
          <div className="flex items-center justify-between px-md py-sm border-b border-outline-variant">
            <h2 className="font-headline-sm text-headline-sm text-on-surface">Recent Orders</h2>
            <Link to="/orders" className="text-sm px-3 py-1.5 rounded border border-outline-variant text-primary hover:bg-surface-container-low">
              View All
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xl text-center px-md">
              <span className="material-symbols-outlined text-4xl text-outline-variant mb-2">receipt_long</span>
              <p className="font-body-md text-body-md text-on-surface-variant">
                No orders yet - use "New Order" on the Orders page to record one.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-container-low text-on-surface">
                <tr>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Order</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Customer</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Amount</th>
                  <th className="text-left px-4 py-2 font-label-bold text-label-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-t border-outline-variant">
                    <td className="px-4 py-2 font-medium">
                      <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-on-surface">{order.customerName}</td>
                    <td className="px-4 py-2 text-on-surface">₹{Number(order.total).toFixed(2)}</td>
                    <td className="px-4 py-2 text-on-surface-variant">{STATUS_LABELS[order.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
