import { useEffect, useState, useCallback } from "react";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../features/notifications/api/notificationsApi";
import { usePermission } from "./usePermission";

const POLL_INTERVAL_MS = 10000; // 10s - the bell badge; the order popup polls on its own

/**
 * Polls the unread count for the bell badge. (The loud new-order sound and
 * popup live in useNewOrderAlerts - one sound per order, not two.)
 * Polling rather than websockets is a deliberate trade: real-time infra isn't
 * worth the complexity at this volume, and a 10s delay is invisible in practice.
 */
export function useNotifications() {
  const { hasPermission } = usePermission();
  const canView = hasPermission("notifications:view");

  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCount = useCallback(async () => {
    if (!canView) return;
    try {
      const count = await fetchUnreadCount();

      setUnreadCount(count);
    } catch {
      // Silent - a failed poll shouldn't throw errors at someone mid-task.
    }
  }, [canView]);

  const loadNotifications = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    try {
      const data = await fetchNotifications({ limit: 15 });
      setNotifications(data);
    } catch {
      setNotifications([]);
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  const markRead = useCallback(
    async (id) => {
      try {
        await markNotificationRead(id);
        setNotifications((current) =>
          current.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
        refreshCount();
      } catch {
        // no-op
      }
    },
    [refreshCount]
  );

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((current) => current.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [canView, refreshCount]);

  return { unreadCount, notifications, isLoading, loadNotifications, markRead, markAllRead, canView };
}
