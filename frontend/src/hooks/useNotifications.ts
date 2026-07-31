import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";

/**
 * Thin wrapper around the shared notification store — components read
 * from (and write to) the same state, so the Topbar badge and the
 * Notifications page always agree.
 */
export function useNotifications() {
  const user = useAuthStore((s) => s.user);

  const notifications = useNotificationStore((s) => s.notifications);
  const loading = useNotificationStore((s) => s.loading);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const fetchIfNeeded = useNotificationStore((s) => s.fetchIfNeeded);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const markRead = useNotificationStore((s) => s.markRead);

  useEffect(() => {
    fetchIfNeeded(user?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { notifications, loading, unreadCount, markAllRead, markRead };
}
