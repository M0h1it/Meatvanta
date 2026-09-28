import CountUp from "../../../components/reactbits/CountUp";
import SpotlightCard from "../../../components/reactbits/SpotlightCard";

/**
 * One stat tile: label, animated value, and change vs the previous period.
 *
 * Props:
 *  - label, icon
 *  - value        number
 *  - money        true -> shown as whole rupees (₹) with Indian digit grouping
 *  - change       % vs previous period, or null when there is nothing to compare
 *  - upIsGood     false for things like cancellations, where a rise is bad news
 *  - sub          small line under the value (e.g. "₹1,200 value")
 *  - hero         bigger, leads the row
 *  - compareLabel { short, full } naming the previous period
 */
export default function KpiCard({ label, icon, value, money = false, change, upIsGood = true, sub, hero = false, compareLabel }) {
  const safeValue = money ? Math.round(Number(value) || 0) : Number(value) || 0;

  return (
    <SpotlightCard
      spotlightColor="rgba(180, 20, 31, 0.08)"
      className={`bg-surface-container-lowest rounded-lg border border-outline-variant p-md ${hero ? "sm:col-span-2" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-on-surface-variant">{label}</p>
        {icon && <span className="material-symbols-outlined text-outline text-xl">{icon}</span>}
      </div>

      <p className={`font-semibold text-on-surface mt-1 tabular-nums ${hero ? "text-4xl md:text-5xl" : "text-2xl"}`}>
        {money && "₹"}
        <CountUp to={safeValue} separator="," locale="en-IN" duration={1} />
      </p>

      {sub && <p className="text-xs text-on-surface-variant mt-1">{sub}</p>}

      <Delta change={change} upIsGood={upIsGood} compareLabel={compareLabel} />
    </SpotlightCard>
  );
}

function Delta({ change, upIsGood, compareLabel }) {
  if (change === undefined) return null;
  if (change === null) {
    return (
      <p className="text-xs text-outline mt-2" title={compareLabel?.full}>
        {compareLabel ? `Nothing to compare in ${compareLabel.short}` : "\u00a0"}
      </p>
    );
  }

  const isFlat = change === 0;
  const isUp = change > 0;
  const good = isFlat ? null : isUp === upIsGood;
  const color = good === null ? "text-on-surface-variant" : good ? "text-on-secondary-fixed-variant" : "text-error";
  const icon = isFlat ? "trending_flat" : isUp ? "trending_up" : "trending_down";

  return (
    <p className={`text-xs mt-2 flex flex-wrap items-center gap-x-1 ${color}`} title={compareLabel?.full}>
      <span className="material-symbols-outlined text-base leading-none" aria-hidden="true">
        {icon}
      </span>
      <span className="font-semibold">
        {isUp ? "+" : ""}
        {change}%
      </span>
      <span className="text-on-surface-variant">vs {compareLabel?.short || "previous period"}</span>
    </p>
  );
}
