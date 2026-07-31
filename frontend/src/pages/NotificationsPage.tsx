import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { formatRelativeTime, formatDuration } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { CallIconButton } from "@/components/CallIconButton";

const memberStatusLabel = (status: string, duration: number) => {
  if (status === "completed") return duration > 0 ? formatDuration(duration) : "Joined";
  if (status === "rejected") return "Declined";
  return "Didn't pick up";
};

const memberStatusColor = (status: string) =>
  status === "completed" ? "text-[#22C55E]" : "text-[#F59E0B]";

const NotificationsPage = () => {
  const { notifications, loading, unreadCount, markAllRead, markRead } =
    useNotifications();

  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  // Opening this page is itself "seeing" the notifications — clear the
  // badge automatically, like opening a phone's notification center.
  useEffect(() => {
    if (!loading && unreadCount > 0) {
      markAllRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#F8FAFC]">Notifications</h2>
          <p className="text-[#94A3B8] text-sm mt-1">
            {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
          </p>
        </div>
        {notifications.length > 0 && (
          <button
            onClick={markAllRead}
            className="flex items-center gap-2 text-sm text-[#06B6D4] hover:text-[#06B6D4]/80 transition-colors"
          >
            <Check className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-[#94A3B8] text-sm py-10 text-center">Loading...</p>
        ) : notifications.length === 0 ? (
          <p className="text-[#94A3B8] text-sm py-10 text-center">
            No notifications yet — they'll show up here as you make and receive calls.
          </p>
        ) : (
          notifications.map((n, i) => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => {
                markRead(n.id);
                if (n.members) {
                  setExpandedId((current) => (current === n.id ? null : n.id));
                }
              }}
              className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors cursor-pointer
                ${!n.read
                  ? "bg-[#1E293B]/80 border-[#334155]/80"
                  : "bg-[#1E293B]/30 border-[#334155]/30"
                } hover:border-[#334155]`}
            >
              <CallIconButton
                contactId={n.contactId}
                contactName={n.contactName}
                icon={n.icon}
                iconClassName={`w-5 h-5 ${n.color}`}
                className={`w-10 h-10 rounded-xl ${n.bg} flex items-center justify-center shrink-0 hover:brightness-125 transition-all`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className={`text-sm font-medium ${!n.read ? "text-[#F8FAFC]" : "text-[#94A3B8]"}`}>
                    {n.title}
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    {!n.read && <div className="w-2 h-2 rounded-full bg-[#06B6D4]" />}
                    <span className="text-[#94A3B8] text-xs">
                      {formatRelativeTime(n.time)}
                    </span>
                    {n.members && (
                      <ChevronDown
                        className={`w-3.5 h-3.5 text-[#94A3B8] transition-transform ${
                          expandedId === n.id ? "rotate-180" : ""
                        }`}
                      />
                    )}
                  </div>
                </div>
                <p className="text-[#94A3B8] text-xs mt-1 leading-relaxed">
                  {n.message}
                </p>

                <AnimatePresence>
                  {n.members && expandedId === n.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      onClick={(e) => e.stopPropagation()}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 pt-3 border-t border-[#334155]/50 space-y-1.5">
                        {n.members.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-[#F8FAFC]">{m.name}</span>
                            <span className={memberStatusColor(m.status)}>
                              {memberStatusLabel(m.status, m.duration)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
