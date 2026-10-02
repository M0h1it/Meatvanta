import { useCallback, useEffect, useState } from "react";
import {
  fetchPendingOrderAlerts,
  acknowledgeOrderAlert,
} from "../features/notifications/api/notificationsApi";
import { usePermission } from "./usePermission";
import {
  playNotificationSound,
  unlockAndPlayNotificationSound,
  isAudioReady,
} from "../lib/notificationSound";

const POLL_INTERVAL_MS = 10000;

// Module-level on purpose: every admin page wraps itself in AdminLayout, so the
// hook can remount on navigation. Remembering what already rang here keeps the
// sound to once per order no matter how many pages the admin opens.
const ringedIds = new Set(); // notification ids already rung for
let ringOwed = false; // a ring is owed but audio was locked

/**
 * Drives the "new order" popup that is shown on every admin page.
 *  - Polls the unread new-order alerts (with order details) every 10 seconds.
 *  - Rings ONCE for each batch of orders it has not rung for yet - never on a
 *    timer. Several orders arriving together still ring once.
 *  - An alert stays until someone presses OK (acknowledge), so a missed sound
 *    never means a missed order. OK marks the notification read.
 *  - If the browser still has audio locked (nobody has clicked the page yet),
 *    `soundBlocked` is true and the ring is played once as soon as it unlocks.
 */
export function useNewOrderAlerts() {
  const { hasPermission } = usePermission();
  const canSee = hasPermission("notifications:view") && hasPermission("orders:view");

  const [alerts, setAlerts] = useState([]);
  const [index, setIndex] = useState(0);
  const [soundBlocked, setSoundBlocked] = useState(false);

  const refresh = useCallback(async () => {
    if (!canSee) return;
    try {
      const incoming = await fetchPendingOrderAlerts();
      setAlerts(incoming);

      const fresh = incoming.filter((a) => !ringedIds.has(a.notificationId));
      if (fresh.length > 0) {
        fresh.forEach((a) => ringedIds.add(a.notificationId));
        if (!playNotificationSound()) ringOwed = true;
      }
    } catch {
      // Silent - a failed poll must not throw errors at someone mid-task.
    }
  }, [canSee]);

  useEffect(() => {
    if (!canSee) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [canSee, refresh]);

  // Watches the browser's audio lock while there is something to announce.
  useEffect(() => {
    if (alerts.length === 0) {
      setSoundBlocked(false);
      return undefined;
    }
    function check() {
      const ready = isAudioReady();
      setSoundBlocked(!ready);
      if (ready && ringOwed) {
        ringOwed = false;
        playNotificationSound();
      }
    }
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [alerts.length]);

  // Keep the "n of N" position valid as alerts come and go.
  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(alerts.length - 1, 0)));
  }, [alerts.length]);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, alerts.length - 1)), [alerts.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  /** OK pressed: the alert is marked read on the server and leaves the popup. */
  const acknowledge = useCallback(async (notificationId) => {
    setAlerts((current) => current.filter((a) => a.notificationId !== notificationId));
    try {
      await acknowledgeOrderAlert(notificationId);
    } catch {
      // It will simply come back on the next poll if the server missed it.
    }
  }, []);

  const replaySound = useCallback(async () => {
    ringOwed = false;
    const ok = await unlockAndPlayNotificationSound();
    setSoundBlocked(!ok);
  }, []);

  return {
    canSee,
    alerts,
    index,
    current: alerts[index] || null,
    next,
    prev,
    acknowledge,
    replaySound,
    soundBlocked,
  };
}
