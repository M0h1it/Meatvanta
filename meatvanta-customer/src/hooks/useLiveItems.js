import { useEffect, useMemo, useState } from "react";
import { serverNow } from "../lib/serverClock";

// setTimeout cannot wait longer than ~24.8 days; longer waits are simply re-checked.
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

/**
 * Keeps a list of things that can END (deal tags, coupons - anything with an `endsAt`) honest
 * while the page stays open: an item drops out of the list at the exact moment it ends, without
 * a reload. Items without `endsAt` are always kept.
 *
 * The check uses the shop server's clock (see serverClock.js), and runs again when the tab
 * comes back to the foreground, because browsers pause timers in background tabs.
 */
export function useLiveItems(items) {
  const [tick, setTick] = useState(0);

  const live = useMemo(
    () => (items || []).filter((item) => !item.endsAt || Date.parse(item.endsAt) > serverNow()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, tick]
  );

  useEffect(() => {
    const upcoming = (items || [])
      .map((item) => Date.parse(item.endsAt))
      .filter((t) => Number.isFinite(t) && t > serverNow());
    if (upcoming.length === 0) return undefined;

    const wait = Math.min(Math.min(...upcoming) - serverNow() + 50, MAX_WAIT_MS);
    const timer = setTimeout(() => setTick((n) => n + 1), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [items, tick]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setTick((n) => n + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return live;
}
