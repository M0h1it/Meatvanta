import { Segmented } from "./TrendChart";
import { PRESETS, GROUP_OPTIONS, isGroupAllowed, todayKey } from "../lib/analyticsFormat";

/**
 * Filter row above the charts: date range preset (+ custom dates), grouping,
 * and whether a sale counts on its order date or its delivery date.
 */
export default function RangeControls({ preset, onPresetChange, custom, onCustomChange, groupBy, onGroupByChange, dateBasis, onDateBasisChange, days }) {
  const today = todayKey();

  return (
    <div className="bg-surface-container-lowest rounded-lg border border-outline-variant p-md mb-md space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="analytics-range" className="text-sm text-on-surface-variant">
          Range
        </label>
        <select
          id="analytics-range"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
          className="text-sm rounded border border-outline-variant px-3 py-2 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        {preset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="From date"
              value={custom.from}
              max={custom.to || today}
              onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
              className="text-sm rounded border border-outline-variant px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-on-surface-variant">to</span>
            <input
              type="date"
              aria-label="To date"
              value={custom.to}
              min={custom.from}
              max={today}
              onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
              className="text-sm rounded border border-outline-variant px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Group by</span>
          <Segmented
            options={GROUP_OPTIONS.map((g) => ({
              ...g,
              disabled: !isGroupAllowed(g.id, days),
              title: !isGroupAllowed(g.id, days) ? "Too many bars for this range - pick a bigger unit" : undefined,
            }))}
            value={groupBy}
            onChange={onGroupByChange}
            ariaLabel="Group by"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-on-surface-variant">Count sales by</span>
          <Segmented
            options={[
              { id: "order", label: "Order date" },
              { id: "delivery", label: "Delivery date" },
            ]}
            value={dateBasis}
            onChange={onDateBasisChange}
            ariaLabel="Count sales by"
          />
        </div>
      </div>
    </div>
  );
}
