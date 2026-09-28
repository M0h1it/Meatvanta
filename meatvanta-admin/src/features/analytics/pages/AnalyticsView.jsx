import { useEffect, useMemo, useState } from "react";
import { fetchAnalytics } from "../api/analyticsApi";
import { usePermission } from "../../../hooks/usePermission";
import RangeControls from "../components/RangeControls";
import KpiCard from "../components/KpiCard";
import TrendChart from "../components/TrendChart";
import HourlyChart from "../components/HourlyChart";
import StatusBreakdown from "../components/StatusBreakdown";
import PaymentSplit from "../components/PaymentSplit";
import { TopSellers, TopCustomers } from "../components/TopLists";
import {
  rangeForPreset,
  autoGroupBy,
  isGroupAllowed,
  daysBetween,
  todayKey,
  addDays,
  formatDateKey,
  formatINR,
  formatNumber,
} from "../lib/analyticsFormat";

/**
 * The "Analytics" tab of the dashboard. A sale = a delivered order.
 * Everything below the filter row reflects the chosen range.
 */
export default function AnalyticsView() {
  const { hasPermission } = usePermission();
  const [preset, setPreset] = useState("last30");
  const [custom, setCustom] = useState({ from: addDays(todayKey(), -6), to: todayKey() });
  const [groupBy, setGroupBy] = useState("day");
  const [groupByTouched, setGroupByTouched] = useState(false);
  const [dateBasis, setDateBasis] = useState("order");

  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const range = useMemo(() => rangeForPreset(preset, custom), [preset, custom]);
  // For "all time" the real start comes back from the server; until then assume a long range.
  const days = range.from ? daysBetween(range.from, range.to) + 1 : data?.range?.isAllTime ? data.range.days : 3650;

  // Pick a sensible grouping for the range unless the admin chose one, and
  // never keep a grouping the server would reject for this range.
  const effectiveGroupBy = groupByTouched && isGroupAllowed(groupBy, days) ? groupBy : autoGroupBy(days);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetchAnalytics({ from: range.from, to: range.to, groupBy: effectiveGroupBy, dateBasis })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Couldn't load analytics.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, effectiveGroupBy, dateBasis]);

  function handlePresetChange(next) {
    setPreset(next);
    setGroupByTouched(false);
  }

  function handleGroupByChange(next) {
    setGroupBy(next);
    setGroupByTouched(true);
  }

  const kpis = data?.kpis;
  const change = data?.previous?.change;
  // Short label on the cards; the exact dates show on hover.
  const compareLabel = data?.previous
    ? {
        short: data.range.days === 1 ? "previous day" : `prev. ${data.range.days} days`,
        full: `${formatDateKey(data.previous.from)} – ${formatDateKey(data.previous.to)}`,
      }
    : undefined;

  return (
    <div>
      <RangeControls
        preset={preset}
        onPresetChange={handlePresetChange}
        custom={custom}
        onCustomChange={setCustom}
        groupBy={effectiveGroupBy}
        onGroupByChange={handleGroupByChange}
        dateBasis={dateBasis}
        onDateBasisChange={setDateBasis}
        days={days}
      />

      {error && (
        <div className="bg-error-container text-on-error-container rounded-lg px-md py-sm mb-md text-sm">{error}</div>
      )}

      {data && (
        <p className="text-xs text-on-surface-variant mb-md">
          {formatDateKey(data.range.from)} – {formatDateKey(data.range.to)} · India time · sales = delivered orders,
          counted by {data.range.dateBasis === "order" ? "order date" : "delivery date"}
          {isLoading && " · updating…"}
        </p>
      )}

      {!data && isLoading ? (
        <LoadingSkeleton />
      ) : (
        data && (
          <div className={`transition-opacity ${isLoading ? "opacity-60" : "opacity-100"}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md mb-md">
              <KpiCard hero label="Sales" icon="payments" money value={kpis.totalSales} change={change?.totalSales} compareLabel={compareLabel} sub={`${formatNumber(kpis.deliveredOrders)} delivered orders`} />
              <KpiCard label="Average order" icon="shopping_basket" money value={kpis.avgOrderValue} change={change?.avgOrderValue} compareLabel={compareLabel} />
              <KpiCard label="Orders placed" icon="receipt_long" value={kpis.ordersPlaced} change={change?.ordersPlaced} compareLabel={compareLabel} />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-md mb-md">
              <KpiCard
                label="New customers"
                icon="person_add"
                value={kpis.newCustomers}
                change={change?.newCustomers}
                compareLabel={compareLabel}
                sub={`${formatNumber(kpis.returningCustomers)} returning`}
              />
              <KpiCard
                label="Cancelled"
                icon="cancel"
                value={kpis.cancelledOrders}
                change={change?.cancelledOrders}
                upIsGood={false}
                compareLabel={compareLabel}
                sub={`${formatINR(kpis.cancelledValue)} value`}
              />
              <KpiCard
                label="Still open"
                icon="pending_actions"
                value={kpis.pendingOrders}
                sub={`${formatINR(kpis.pendingValue)} not yet delivered`}
              />
              <KpiCard
                label="Unpaid online checkouts"
                icon="remove_shopping_cart"
                value={kpis.abandonedCheckouts}
                change={change?.abandonedCheckouts}
                upIsGood={false}
                compareLabel={compareLabel}
                sub={`${formatINR(kpis.abandonedValue)} left at payment`}
              />
            </div>

            <div className="mb-md">
              <TrendChart series={data.series} groupBy={data.range.groupBy} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-md mb-md">
              <div className="lg:col-span-2">
                <TopSellers data={data} />
              </div>
              <TopCustomers customers={data.topCustomers} canOpenCustomers={hasPermission("customers:view")} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-md mb-md">
              <div className="lg:col-span-2">
                <HourlyChart hourly={data.hourly} />
              </div>
              <div className="space-y-md">
                <PaymentSplit paymentSplit={data.paymentSplit} />
                <StatusBreakdown statusBreakdown={data.statusBreakdown} />
              </div>
            </div>

            <p className="text-xs text-on-surface-variant">
              Discounts given {formatINR(kpis.discountGiven)} · Delivery charges collected {formatINR(kpis.deliveryCharges)}.
              "Unpaid online checkouts" are Razorpay payments that were started but not completed within 30 minutes.
              Carts are kept in the customer's browser, so items added to a cart without checking out can't be counted yet.
            </p>
          </div>
        )
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading analytics">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md mb-md">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-32 rounded-lg bg-surface-container ${i === 0 ? "sm:col-span-2" : ""}`} />
        ))}
      </div>
      <div className="h-80 rounded-lg bg-surface-container mb-md" />
      <div className="h-64 rounded-lg bg-surface-container" />
    </div>
  );
}
