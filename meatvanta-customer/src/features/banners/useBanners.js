import { useMemo, useSyncExternalStore } from "react";
import { fetchLiveBanners } from "./api/bannersApi";
import { serverNow } from "../../lib/serverClock";

/**
 * One shared store for every banner spot on the page.
 *
 * Banners have a start and an end time, so a copy fetched once would go stale while the visitor
 * keeps browsing. The store therefore:
 *  - fetches when the first banner spot appears,
 *  - refreshes at the exact moment the server says the live set changes (`nextChangeAt`: a banner
 *    ends or a scheduled one starts), using the server's clock,
 *  - and refreshes every minute as a safety net, and when the tab comes back to the foreground.
 * A failed request just means no banners (or the last good list) - never a broken page.
 */
const EMPTY = { banners: {}, layouts: {}, nextChangeAt: null };
const DEFAULT_LAYOUT = { desktopRatio: "auto", mobileRatio: "auto", fullWidth: false };
const SAFETY_REFRESH_MS = 60 * 1000;
const MAX_WAIT_MS = 6 * 60 * 60 * 1000;

let snapshot = EMPTY;
let hasData = false;
let inflight = null;
let changeTimer = null;
let safetyTimer = null;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l());
}

function scheduleNextChange() {
  clearTimeout(changeTimer);
  const at = Date.parse(snapshot.nextChangeAt);
  if (!Number.isFinite(at)) return;
  // A little after the change, so the server answers with the new state.
  const wait = Math.min(Math.max(at - serverNow() + 300, 500), MAX_WAIT_MS);
  changeTimer = setTimeout(refresh, wait);
}

async function refresh() {
  if (inflight) return inflight;
  inflight = fetchLiveBanners()
    .then((data) => {
      snapshot = data;
      hasData = true;
    })
    .catch(() => {
      if (!hasData) snapshot = EMPTY; // keep the last good list if a refresh fails
    })
    .finally(() => {
      inflight = null;
      emit();
      scheduleNextChange();
    });
  return inflight;
}

function onVisible() {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    safetyTimer = setInterval(refresh, SAFETY_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(safetyTimer);
      clearTimeout(changeTimer);
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

const getSnapshot = () => snapshot;

/** Live banners for one placement ([] while loading or when there are none). */
export function useBanners(placement) {
  const data = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => data.banners[placement] || [], [data, placement]);
}

/** The admin-chosen shape for one placement. */
export function useBannerLayout(placement) {
  const data = useSyncExternalStore(subscribe, getSnapshot);
  return data.layouts[placement] || DEFAULT_LAYOUT;
}
