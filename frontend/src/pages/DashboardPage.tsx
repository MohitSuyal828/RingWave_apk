import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ShieldQuestion,
  Clock,
  Users,
  ChevronDown,
} from "lucide-react";
import { formatRelativeTime, formatDuration } from "@/lib/utils";
import { axiosInstance } from "@/services/axios";
import { listContacts, type Contact } from "@/services/contacts";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useCall } from "@/context/CallContext";
import { CallIconButton } from "@/components/CallIconButton";
import { mapPredictionToDetectionState } from "@/constants/detection";
import {
  groupCallRows,
  otherPartyName,
  otherPartyId,
  type CallHistoryRow,
} from "@/lib/callGrouping";

interface DetectionLogRow {
  id: number;
  prediction: string;
  confidence_score: number;
  created_at: string;
}

const memberStatusLabel = (status: string, duration: number) => {
  if (status === "completed") return duration > 0 ? formatDuration(duration) : "Joined";
  if (status === "rejected") return "Declined";
  return "Didn't pick up";
};

const memberStatusColor = (status: string) =>
  status === "completed" ? "text-[#22C55E]" : "text-[#F59E0B]";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

const DashboardPage = () => {
  const user = useAuthStore((s) => s.user);
  const { startCall } = useCall();
  // Bumped by notificationStore.refresh()/invalidate() every time a call
  // is logged (see CallContext's logCallOutcome) -- included below so
  // this effect re-fetches live instead of only once on mount, which
  // previously left the stats/recent-calls list stuck at whatever they
  // were when the Dashboard first mounted.
  const callLogVersion = useNotificationStore((s) => s.version);

  const [calls, setCalls] = useState<CallHistoryRow[]>([]);
  const [totalCalls, setTotalCalls] = useState<number | null>(null);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callsError, setCallsError] = useState(false);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState(false);

  const [detections, setDetections] = useState<DetectionLogRow[]>([]);
  const [totalDetections, setTotalDetections] = useState<number | null>(null);
  const [detectionsLoading, setDetectionsLoading] = useState(true);
  const [detectionsError, setDetectionsError] = useState(false);

  const [expandedGroupKey, setExpandedGroupKey] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axiosInstance.get("/calls/history", {
          params: { page: 1, limit: 100 },
        });

        setCalls(res.data.data.calls);
        setTotalCalls(res.data.data.pagination.total);
        setCallsError(false);
      } catch (err) {
        console.error("Failed to fetch call history:", err);
        setCallsError(true);
      } finally {
        setCallsLoading(false);
      }
    };

    const fetchContacts = async () => {
      try {
        const data = await listContacts();
        setContacts(data);
        setContactsError(false);
      } catch (err) {
        console.error("Failed to fetch contacts:", err);
        setContactsError(true);
      } finally {
        setContactsLoading(false);
      }
    };

    const fetchDetections = async () => {
      try {
        const res = await axiosInstance.get("/detections/history", {
          params: { page: 1, limit: 100 },
        });

        setDetections(res.data.data.detections);
        setTotalDetections(res.data.data.pagination.total);
        setDetectionsError(false);
      } catch (err) {
        console.error("Failed to fetch detection history:", err);
        setDetectionsError(true);
      } finally {
        setDetectionsLoading(false);
      }
    };

    fetchHistory();
    fetchContacts();
    fetchDetections();
  }, [callLogVersion]);

  // ------------------------------------------------------
  // Derived stats — computed from the fetched batch. If there are more
  // calls than the batch size, `totalCalls` (a real DB count) still stays
  // accurate; the completed/missed breakdown is a "recent" approximation
  // in that edge case rather than a fabricated number.
  // ------------------------------------------------------
  const stats = useMemo(() => {
    const missed = calls.filter((c) => c.status === "missed").length;
    const completed = calls.filter((c) => c.status === "completed").length;

    const genuine = detections.filter(
      (d) => mapPredictionToDetectionState(d.prediction) === "genuine"
    ).length;
    const flagged = detections.filter((d) => {
      const state = mapPredictionToDetectionState(d.prediction);
      return state === "suspicious" || state === "synthetic";
    }).length;

    return {
      total: totalCalls ?? calls.length,
      missed,
      completed,
      detectionsAnalyzed: totalDetections ?? detections.length,
      genuine,
      flagged,
    };
  }, [calls, totalCalls, detections, totalDetections]);

  const recentEntries = groupCallRows(calls).slice(0, 5);

  const directionOf = (call: CallHistoryRow) =>
    call.caller_id === user?.id ? "outgoing" : "incoming";

  return (
    <div className="space-y-6">

      {/* Welcome */}
      <motion.div {...fadeUp} transition={{ delay: 0.05 }}>
        <h2 className="text-2xl font-bold text-[#F8FAFC]">
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
        </h2>
        <p className="text-[#94A3B8] text-sm mt-1">
          Here's what's happening with your calls today.
        </p>
      </motion.div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Total Calls",
            value: callsLoading || callsError ? "—" : String(stats.total),
            icon: PhoneCall,
            color: "#06B6D4",
            border: "border-[#06B6D4]/20",
            bg: "bg-[#06B6D4]/10",
          },
          {
            label: "Completed",
            value: callsLoading || callsError ? "—" : String(stats.completed),
            icon: PhoneIncoming,
            color: "#22C55E",
            border: "border-[#22C55E]/20",
            bg: "bg-[#22C55E]/10",
          },
          {
            label: "Missed",
            value: callsLoading || callsError ? "—" : String(stats.missed),
            icon: PhoneMissed,
            color: "#F59E0B",
            border: "border-[#F59E0B]/20",
            bg: "bg-[#F59E0B]/10",
          },
          {
            label: "Voice Analysis",
            value: detectionsLoading || detectionsError
              ? "—"
              : stats.detectionsAnalyzed > 0
              ? String(stats.detectionsAnalyzed)
              : "N/A",
            sublabel: detectionsError
              ? "Couldn't load"
              : !detectionsLoading && stats.detectionsAnalyzed > 0
                ? `${stats.genuine} genuine · ${stats.flagged} flagged`
                : "No calls analyzed yet",
            icon: ShieldQuestion,
            color: "#94A3B8",
            border: "border-[#334155]/60",
            bg: "bg-[#334155]/10",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            {...fadeUp}
            transition={{ delay: 0.1 + i * 0.05 }}
            className={`bg-[#1E293B]/60 backdrop-blur border ${stat.border} rounded-2xl p-5`}
          >
            <div className="flex items-start justify-between mb-3">
              <div
                className={`w-10 h-10 rounded-xl ${stat.bg} border ${stat.border} flex items-center justify-center`}
              >
                <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
              </div>
            </div>
            <p className="text-3xl font-bold text-[#F8FAFC]">{stat.value}</p>
            <p className="text-[#94A3B8] text-sm mt-1">{stat.label}</p>
            {stat.sublabel && (
              <p className="text-[#475569] text-xs mt-0.5">{stat.sublabel}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent calls */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.25 }}
          className="lg:col-span-2 bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#06B6D4]" />
              <h3 className="text-[#F8FAFC] font-semibold">Recent Calls</h3>
            </div>
          </div>

          <div className="space-y-2">
            {callsLoading ? (
              <p className="text-[#94A3B8] text-sm py-6 text-center">
                Loading...
              </p>
            ) : callsError ? (
              <p className="text-[#F59E0B] text-sm py-6 text-center">
                Couldn't load recent calls.
              </p>
            ) : recentEntries.length === 0 ? (
              <p className="text-[#94A3B8] text-sm py-6 text-center">
                No calls yet — start one from Contacts.
              </p>
            ) : (
              recentEntries.map((entry, i) => {
                if (entry.isGroup) {
                  const joined = entry.rows.filter((r) => r.status === "completed").length;
                  const isExpanded = expandedGroupKey === entry.key;

                  return (
                    <motion.div
                      key={entry.key}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.05 }}
                      onClick={() =>
                        setExpandedGroupKey((current) =>
                          current === entry.key ? null : entry.key
                        )
                      }
                      className="rounded-xl hover:bg-[#334155]/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 p-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center shrink-0">
                          <Users className="w-4 h-4 text-[#06B6D4]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#F8FAFC] text-sm font-medium truncate">
                            Group call · {entry.rows.length} invited
                          </p>
                          <p className="text-[#94A3B8] text-xs">
                            {joined} joined
                          </p>
                        </div>
                        <span className="text-[#94A3B8] text-xs whitespace-nowrap">
                          {formatRelativeTime(entry.createdAt)}
                        </span>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-[#94A3B8] shrink-0 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            onClick={(e) => e.stopPropagation()}
                            className="overflow-hidden"
                          >
                            <div className="mx-2.5 mb-2.5 pl-11 pr-2 py-2 space-y-1.5 border-t border-[#334155]/40 pt-2.5">
                              {entry.rows.map((r) => {
                                const memberId = otherPartyId(r, user?.id);
                                const memberName = otherPartyName(r, user?.id);
                                return (
                                  <div
                                    key={`${entry.key}-${memberId}`}
                                    className="flex items-center justify-between text-xs"
                                  >
                                    <span className="text-[#F8FAFC]">{memberName}</span>
                                    <span className={memberStatusColor(r.status)}>
                                      {memberStatusLabel(r.status, r.duration)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                }

                const call = entry.row;
                const direction = directionOf(call);
                const name = otherPartyName(call, user?.id);

                return (
                  <motion.div
                    key={entry.key}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.05 }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#334155]/20 transition-colors"
                  >
                    <CallIconButton
                      contactId={otherPartyId(call, user?.id)}
                      contactName={name}
                      icon={
                        call.status === "missed"
                          ? PhoneMissed
                          : direction === "incoming"
                          ? PhoneIncoming
                          : PhoneOutgoing
                      }
                      iconClassName={`w-4 h-4 ${
                        call.status === "missed"
                          ? "text-[#EF4444]"
                          : direction === "incoming"
                          ? "text-[#06B6D4]"
                          : "text-[#94A3B8]"
                      }`}
                    />

                    <div className="flex-1 min-w-0">
                      <p className="text-[#F8FAFC] text-sm font-medium truncate">
                        {name}
                      </p>
                      <p className="text-[#94A3B8] text-xs">
                        {call.duration > 0
                          ? formatDuration(call.duration)
                          : "No answer"}
                      </p>
                    </div>

                    <span className="text-[#94A3B8] text-xs whitespace-nowrap">
                      {formatRelativeTime(call.created_at)}
                    </span>
                  </motion.div>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Contacts / quick call */}
        <motion.div
          {...fadeUp}
          transition={{ delay: 0.3 }}
          className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[#06B6D4]" />
              <h3 className="text-[#F8FAFC] font-semibold">Contacts</h3>
            </div>
          </div>

          <div className="space-y-2">
            {contactsLoading ? (
              <p className="text-[#94A3B8] text-sm py-6 text-center">
                Loading...
              </p>
            ) : contactsError ? (
              <p className="text-[#F59E0B] text-sm py-6 text-center">
                Couldn't load contacts.
              </p>
            ) : contacts.length === 0 ? (
              <p className="text-[#94A3B8] text-sm py-6 text-center">
                No contacts yet — add one from the Contacts page.
              </p>
            ) : (
              contacts.slice(0, 5).map((contact, i) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-[#334155]/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center shrink-0">
                    <span className="text-[#94A3B8] text-xs font-bold">
                      {contact.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[#F8FAFC] text-sm font-medium truncate">
                      {contact.name}
                    </p>
                    <p className="text-[#94A3B8] text-xs truncate">
                      {contact.email}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      startCall([{ id: contact.id, name: contact.name }])
                    }
                    className="w-7 h-7 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/20 flex items-center justify-center text-[#06B6D4] hover:bg-[#06B6D4]/20 transition-colors shrink-0"
                  >
                    <PhoneCall className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </div>

      {/* Detection summary */}
      <motion.div
        {...fadeUp}
        transition={{ delay: 0.4 }}
        className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-5 flex items-center gap-4"
      >
        <div className="w-11 h-11 rounded-xl bg-[#334155]/20 border border-[#334155]/60 flex items-center justify-center shrink-0">
          <ShieldQuestion className="w-5 h-5 text-[#94A3B8]" />
        </div>
        <div>
          <p className="text-[#F8FAFC] font-semibold text-sm">
            Voice authenticity detection
          </p>
          <p className="text-[#94A3B8] text-xs mt-0.5">
            {detectionsLoading
              ? "Loading..."
              : detectionsError
              ? "Couldn't load detection data."
              : stats.detectionsAnalyzed > 0
              ? `${stats.detectionsAnalyzed} voice readings analyzed across your calls — ${stats.genuine} genuine, ${stats.flagged} flagged.`
              : "No readings yet — detection runs automatically in the background during a call."}
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default DashboardPage;
