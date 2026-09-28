import { useState } from "react";
import { Link } from "react-router-dom";
import { Segmented } from "./TrendChart";
import { formatINR, formatNumber } from "../lib/analyticsFormat";

const TABS = [
  { id: "topProducts", label: "Products", qtyLabel: "Qty" },
  { id: "topVariants", label: "Sizes", qtyLabel: "Qty" },
  { id: "topOptions", label: "Add-ons", qtyLabel: "Times chosen" },
  { id: "topCategories", label: "Categories", qtyLabel: "Qty" },
];

/** Best sellers from delivered orders, with a small inline bar for revenue. */
export function TopSellers({ data }) {
  const [tab, setTab] = useState("topProducts");
  const current = TABS.find((t) => t.id === tab);
  const rows = data[tab] || [];
  const sortKey = tab === "topOptions" ? "quantity" : "revenue";
  const max = Math.max(1, ...rows.map((r) => r[sortKey]));

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-md">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Top performers</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">From delivered orders</p>
        </div>
        <Segmented options={TABS} value={tab} onChange={setTab} ariaLabel="Top list" />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">Nothing sold in this range yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-on-surface-variant">
              <th className="text-left font-label-bold text-label-bold pb-2 w-8">#</th>
              <th className="text-left font-label-bold text-label-bold pb-2">Name</th>
              <th className="text-right font-label-bold text-label-bold pb-2 pl-2">{current.qtyLabel}</th>
              <th className="text-right font-label-bold text-label-bold pb-2 pl-2">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t border-outline-variant">
                <td className="py-2 text-on-surface-variant tabular-nums">{i + 1}</td>
                <td className="py-2 pr-2">
                  <p className="text-on-surface">{r.name}</p>
                  <div className="h-1.5 rounded-full bg-surface-container mt-1">
                    <div className="h-1.5 rounded-full bg-primary/70" style={{ width: `${(r[sortKey] / max) * 100}%` }} />
                  </div>
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-on-surface">{formatNumber(r.quantity)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-on-surface font-semibold">{formatINR(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Biggest spenders. Phone numbers arrive masked from the server. */
export function TopCustomers({ customers, canOpenCustomers }) {
  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">Top customers</h2>
      <p className="text-xs text-on-surface-variant mt-0.5 mb-md">By delivered spend</p>

      {customers.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4">No delivered orders in this range yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-on-surface-variant">
              <th className="text-left font-label-bold text-label-bold pb-2">Customer</th>
              <th className="text-right font-label-bold text-label-bold pb-2 pl-2">Orders</th>
              <th className="text-right font-label-bold text-label-bold pb-2 pl-2">Spend</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={`${c.name}-${c.phone}`} className="border-t border-outline-variant">
                <td className="py-2">
                  {canOpenCustomers && c.customerId ? (
                    <Link to={`/customers/${c.customerId}`} className="text-primary hover:underline">
                      {c.name}
                    </Link>
                  ) : (
                    <span className="text-on-surface">{c.name}</span>
                  )}
                  <p className="text-xs text-on-surface-variant tabular-nums">
                    {c.phone}
                    {!c.customerId && " · guest"}
                  </p>
                </td>
                <td className="py-2 pl-2 text-right tabular-nums text-on-surface">{formatNumber(c.orders)}</td>
                <td className="py-2 pl-2 text-right tabular-nums text-on-surface font-semibold">{formatINR(c.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
