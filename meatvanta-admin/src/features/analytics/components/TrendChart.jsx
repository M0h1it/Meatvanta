import { useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CHART, AXIS_TICK } from "../lib/chartTheme";
import { formatINR, formatINRCompact, formatNumber } from "../lib/analyticsFormat";

const METRICS = {
  sales: { label: "Sales", key: "sales", format: formatINR, tick: formatINRCompact },
  deliveredOrders: { label: "Delivered orders", key: "deliveredOrders", format: formatNumber, tick: formatNumber },
  ordersPlaced: { label: "Orders placed", key: "ordersPlaced", format: formatNumber, tick: formatNumber },
};

/**
 * Sales / orders over time. One measure at a time (switch with the tabs) so
 * there is only ever one y-axis. A table view shows the same numbers.
 */
export default function TrendChart({ series, groupBy }) {
  const [metricId, setMetricId] = useState("sales");
  const [view, setView] = useState("chart");
  const metric = METRICS[metricId];
  const total = series.reduce((s, b) => s + (b[metric.key] || 0), 0);

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-md">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{metric.label} by {groupBy}</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Total {metric.format(total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented
            options={Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label }))}
            value={metricId}
            onChange={setMetricId}
            ariaLabel="Measure"
          />
          <Segmented
            options={[
              { id: "chart", label: "Chart" },
              { id: "table", label: "Table" },
            ]}
            value={view}
            onChange={setView}
            ariaLabel="View"
          />
        </div>
      </div>

      {view === "chart" ? (
        <div className="h-72" role="img" aria-label={`${metric.label} by ${groupBy}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: CHART.grid }}
                minTickGap={16}
              />
              <YAxis
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
                width={56}
                allowDecimals={metricId === "sales"}
                tickFormatter={metric.tick}
              />
              <Tooltip
                cursor={{ fill: "rgba(180, 20, 31, 0.06)" }}
                content={<TrendTooltip metric={metric} />}
              />
              <Bar dataKey={metric.key} fill={CHART.primary} maxBarSize={24} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-72 overflow-auto border border-outline-variant rounded">
          <table className="w-full text-sm">
            <thead className="bg-surface-container-low sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-label-bold text-label-bold">Period</th>
                <th className="text-right px-3 py-2 font-label-bold text-label-bold">Sales</th>
                <th className="text-right px-3 py-2 font-label-bold text-label-bold">Delivered</th>
                <th className="text-right px-3 py-2 font-label-bold text-label-bold">Placed</th>
              </tr>
            </thead>
            <tbody>
              {series.map((b) => (
                <tr key={b.key} className="border-t border-outline-variant">
                  <td className="px-3 py-1.5">{b.fullLabel}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(b.sales)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(b.deliveredOrders)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(b.ordersPlaced)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function TrendTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null;
  const b = payload[0].payload;
  return (
    <div className="bg-white border border-outline-variant rounded shadow-md px-3 py-2 text-xs">
      <p className="font-semibold text-on-surface mb-1">{b.fullLabel}</p>
      <p className="text-on-surface">
        <span className="inline-block w-2 h-2 rounded-sm mr-1.5 align-middle" style={{ background: CHART.primary }} />
        {metric.label}: <span className="font-semibold">{metric.format(b[metric.key])}</span>
      </p>
      {metric.key === "sales" && (
        <p className="text-on-surface-variant mt-0.5">{formatNumber(b.deliveredOrders)} delivered orders</p>
      )}
    </div>
  );
}

export function Segmented({ options, value, onChange, ariaLabel, size = "sm" }) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex rounded border border-outline-variant overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          title={opt.title}
          onClick={() => onChange(opt.id)}
          aria-pressed={value === opt.id}
          className={`${size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-3 py-2"} border-l first:border-l-0 border-outline-variant transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            value === opt.id
              ? "bg-primary-container text-on-primary"
              : "bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
