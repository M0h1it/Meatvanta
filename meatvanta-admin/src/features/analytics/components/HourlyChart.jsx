import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { CHART, AXIS_TICK } from "../lib/chartTheme";
import { formatHour, formatNumber } from "../lib/analyticsFormat";

/** Orders placed per hour of the day (India time) - shows when customers order. */
export default function HourlyChart({ hourly }) {
  const total = hourly.reduce((s, h) => s + h.orders, 0);
  const peak = hourly.reduce((best, h) => (h.orders > best.orders ? h : best), hourly[0]);

  return (
    <section className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md">
      <h2 className="font-headline-sm text-headline-sm text-on-surface">When customers order</h2>
      <p className="text-xs text-on-surface-variant mt-0.5 mb-md">
        {total === 0
          ? "No orders in this range."
          : `Busiest hour: ${formatHour(peak.hour)} – ${formatHour((peak.hour + 1) % 24)} (${formatNumber(peak.orders)} orders)`}
      </p>
      <div className="h-56" role="img" aria-label="Orders placed per hour of the day">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={hourly} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis
              dataKey="hour"
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
              tickFormatter={formatHour}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(180, 20, 31, 0.06)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="bg-white border border-outline-variant rounded shadow-md px-3 py-2 text-xs">
                    <p className="font-semibold text-on-surface">
                      {formatHour(payload[0].payload.hour)} – {formatHour((payload[0].payload.hour + 1) % 24)}
                    </p>
                    <p className="text-on-surface">{formatNumber(payload[0].payload.orders)} orders</p>
                  </div>
                ) : null
              }
            />
            <Bar dataKey="orders" fill={CHART.primary} maxBarSize={24} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
