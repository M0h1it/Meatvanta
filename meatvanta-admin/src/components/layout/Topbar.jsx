import { useState, useRef, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import { playNotificationSound } from "../../lib/notificationSound";

function timeAgo(dateString) {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Topbar() {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef(null);

  const { unreadCount, notifications, isLoading, loadNotifications, markRead, markAllRead, canView } =
    useNotifications();

  useEffect(() => {
    function handleClickOutside(e) {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function toggleNotifications() {
    const opening = !notificationsOpen;
    setNotificationsOpen(opening);
    if (opening) loadNotifications();
  }

  function handleNotificationClick(notification) {
    if (!notification.isRead) markRead(notification.id);
    setNotificationsOpen(false);
    if (notification.entityType === "Order") navigate(notification.entityId ? `/orders/${notification.entityId}` : "/orders");
  }

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between gap-md h-16 px-md md:px-lg border-b border-outline-variant bg-surface">
      {/* Shown on every screen size - shorter label on mobile so it doesn't crowd the icons */}
      <h2 className="font-headline-sm text-headline-sm text-primary">
        <span className="hidden sm:inline">Meat Vanta Admin</span>
        <span className="sm:hidden">Meat Vanta</span>
      </h2>

      <div className="flex items-center gap-md ml-auto">
        {canView && (
          <div className="relative" ref={notificationsRef}>
            <button
              onClick={toggleNotifications}
              className="relative text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-low"
              aria-label="Notifications"
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-error text-white text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-surface-container-lowest border border-outline-variant rounded-lg shadow-lg z-50">
                <div className="px-md py-sm border-b border-outline-variant flex items-center justify-between">
                  <p className="font-label-bold text-label-bold text-on-surface">Notifications</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={playNotificationSound}
                      className="text-xs text-on-surface-variant hover:text-on-surface"
                      title="Play the new-order alert to check your volume"
                    >
                      Test sound
                    </button>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-xs text-primary hover:underline">
                        Mark all read
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {isLoading ? (
                    <p className="px-md py-lg text-center text-sm text-on-surface-variant">Loading...</p>
                  ) : notifications.length === 0 ? (
                    <div className="px-md py-lg text-center">
                      <span className="material-symbols-outlined text-2xl text-outline-variant">
                        notifications_off
                      </span>
                      <p className="text-sm text-on-surface-variant mt-1">No notifications yet.</p>
                    </div>
                  ) : (
                    notifications.map((notification) => (
                      <button
                        key={notification.id}
                        onClick={() => handleNotificationClick(notification)}
                        className={`w-full text-left px-md py-sm border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low transition-colors ${
                          notification.isRead ? "" : "bg-primary-container/5"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                          )}
                          <div className={notification.isRead ? "pl-4" : ""}>
                            <p className="text-sm font-medium text-on-surface">{notification.title}</p>
                            <p className="text-xs text-on-surface-variant mt-0.5">{notification.message}</p>
                            <p className="text-[10px] text-on-surface-variant mt-1">
                              {timeAgo(notification.createdAt)}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <Link
          to="/settings"
          className="text-on-surface-variant hover:text-on-surface p-1 rounded hover:bg-surface-container-low hidden sm:inline-flex"
          aria-label="Settings"
        >
          <span className="material-symbols-outlined">account_circle</span>
        </Link>

        <div className="text-right leading-tight hidden sm:block">
          <p className="font-body-md text-body-md font-semibold text-on-surface">{admin?.name}</p>
          <p className="text-xs text-on-surface-variant capitalize">{admin?.role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="font-label-bold text-label-bold text-primary hover:text-on-primary-fixed-variant px-sm py-1 rounded transition-colors"
        >
          Logout
        </button>
      </div>
    </header>
  );
}
