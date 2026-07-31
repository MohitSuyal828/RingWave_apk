import { create } from "zustand";
import type { ComponentType } from "react";
import { Phone, PhoneMissed, PhoneOff, Users } from "lucide-react";
import { axiosInstance } from "@/services/axios";
import { formatDuration } from "@/lib/utils";
import { groupCallRows, otherPartyName, otherPartyId, type CallHistoryRow } from "@/lib/callGrouping";

export interface AppNotification {
  /** Unique per notification. For a group call this is the session id
   *  (a string); for a single call it's the call_history row id. */
  id: number | string;
  /** IDs to log "read" against — a group notification marks every row
   *  in that session read at once. */
  readIds: number[];
  contactId: number;
  contactName: string;
  title: string;
  message: string;
  time: string;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  read: boolean;
  /** Present only on a group call notification — one entry per person
   *  who was invited, so the UI can show exactly who was on the call. */
  members?: Array<{
    id: number;
    name: string;
    status: CallHistoryRow["status"];
    duration: number;
  }>;
}

const READ_STORAGE_KEY = "ringwave:read_notifications";

const loadReadIds = (): Set<number> => {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY);
    return new Set<number>(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set<number>();
  }
};

const persistReadIds = (ids: Set<number>) => {
  try {
    localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Not worth surfacing — notifications just won't stay marked-read.
  }
};

const buildSingleNotification = (
  call: CallHistoryRow,
  currentUserId: number | undefined,
  readIds: Set<number>
): AppNotification => {
  const iAmCaller = call.caller_id === currentUserId;
  const contactId = otherPartyId(call, currentUserId);
  const contactName = otherPartyName(call, currentUserId);

  let title: string;
  let message: string;
  let icon: AppNotification["icon"] = Phone;
  let color = "text-[#22C55E]";
  let bg = "bg-[#22C55E]/10";

  if (call.status === "missed") {
    title = "Missed call";
    message = `You missed a call from ${contactName}.`;
    icon = PhoneMissed;
    color = "text-[#F59E0B]";
    bg = "bg-[#F59E0B]/10";
  } else if (call.status === "rejected") {
    icon = PhoneOff;
    color = "text-[#F59E0B]";
    bg = "bg-[#F59E0B]/10";
    if (iAmCaller) {
      title = "Call declined";
      message = `${contactName} declined your call.`;
    } else {
      title = "Call declined";
      message = `You declined a call from ${contactName}.`;
    }
  } else {
    title = "Call ended";
    message = `Your call with ${contactName} lasted ${formatDuration(call.duration)}.`;
  }

  return {
    id: call.id,
    readIds: [call.id],
    contactId,
    contactName,
    title,
    message,
    time: call.created_at,
    icon,
    color,
    bg,
    read: readIds.has(call.id),
  };
};

const buildGroupNotification = (
  rows: CallHistoryRow[],
  sessionId: string,
  currentUserId: number | undefined,
  readIds: Set<number>
): AppNotification => {
  const joined = rows.filter((r) => r.status === "completed");
  const missed = rows.filter((r) => r.status !== "completed");

  const parts: string[] = [];
  if (joined.length > 0) parts.push(`${joined.length} joined`);
  if (missed.length > 0) parts.push(`${missed.length} didn't pick up`);

  return {
    id: sessionId,
    readIds: rows.map((r) => r.id),
    contactId: otherPartyId(rows[0], currentUserId),
    contactName: otherPartyName(rows[0], currentUserId),
    title: "Group call",
    message: `You called ${rows.length} people — ${parts.join(", ")}.`,
    time: rows[0].created_at,
    icon: Users,
    color: "text-[#06B6D4]",
    bg: "bg-[#06B6D4]/10",
    read: rows.every((r) => readIds.has(r.id)),
    members: rows.map((r) => ({
      id: otherPartyId(r, currentUserId),
      name: otherPartyName(r, currentUserId),
      status: r.status,
      duration: r.duration,
    })),
  };
};

interface NotificationState {
  notifications: AppNotification[];
  loading: boolean;
  hasFetched: boolean;
  unreadCount: number;
  /** Bumped every time invalidate()/refresh() runs (i.e. whenever a call
   *  was just logged). Pages that show call-derived data but aren't
   *  re-mounted on every call (Dashboard, Call History) can put this in
   *  a useEffect dependency array to refetch live instead of only once
   *  on mount. */
  version: number;
  fetchIfNeeded: (currentUserId: number | undefined) => Promise<void>;
  /** Forces the next call (fetchIfNeeded or refresh) to hit the network
   *  again instead of trusting the cached batch — call this whenever a
   *  call just ended so the badge/notifications page can catch up. */
  invalidate: () => void;
  /** Invalidates and immediately refetches — use this right after a call
   *  ends so the Topbar badge updates without waiting for a page visit. */
  refresh: (currentUserId: number | undefined) => Promise<void>;
  markAllRead: () => void;
  markRead: (id: number | string) => void;
}

/**
 * Derives notifications from real call history (missed/declined/completed
 * calls, and grouped composite entries for group calls) — there's no
 * dedicated notifications backend. This is a shared store (not a
 * per-component hook) specifically so the Topbar's unread badge and the
 * Notifications page always agree.
 */
export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  loading: true,
  hasFetched: false,
  unreadCount: 0,
  version: 0,

  fetchIfNeeded: async (currentUserId) => {
    if (get().hasFetched) return;

    try {
      const res = await axiosInstance.get("/calls/history", {
        params: { page: 1, limit: 30 },
      });

      const readIds = loadReadIds();
      const calls: CallHistoryRow[] = res.data.data.calls.filter(
        (c: CallHistoryRow) => c.status !== "completed" || c.duration > 0
      );

      const entries = groupCallRows(calls);

      const notifications = entries.map((entry) =>
        entry.isGroup
          ? buildGroupNotification(entry.rows, entry.key, currentUserId, readIds)
          : buildSingleNotification(entry.row, currentUserId, readIds)
      );

      set({
        notifications,
        loading: false,
        hasFetched: true,
        unreadCount: notifications.filter((n) => !n.read).length,
      });
    } catch (err) {
      console.error("Failed to fetch call history:", err);
      set({ loading: false, hasFetched: true });
    }
  },

  invalidate: () => {
    set((state) => ({ hasFetched: false, version: state.version + 1 }));
  },

  refresh: async (currentUserId) => {
    set((state) => ({ hasFetched: false, version: state.version + 1 }));
    await get().fetchIfNeeded(currentUserId);
  },

  markAllRead: () => {
    const ids = new Set<number>(get().notifications.flatMap((n) => n.readIds));
    persistReadIds(ids);

    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  markRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target) return;

    const ids = loadReadIds();
    for (const rid of target.readIds) ids.add(rid);
    persistReadIds(ids);

    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      };
    });
  },
}));
