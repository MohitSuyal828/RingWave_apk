import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Search, Clock, ChevronLeft, ChevronRight, Users, X,
} from "lucide-react";
import { formatRelativeTime, formatDuration } from "@/lib/utils";
import { axiosInstance } from "@/services/axios";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { CallIconButton } from "@/components/CallIconButton";
import {
  groupCallRows,
  otherPartyName,
  otherPartyId,
  type CallHistoryRow,
} from "@/lib/callGrouping";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  completed: { label: "Completed", color: "text-[#22C55E]", bg: "bg-[#22C55E]/10" },
  missed: { label: "Missed", color: "text-[#EF4444]", bg: "bg-[#EF4444]/10" },
  rejected: { label: "Declined", color: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10" },
};

const PAGE_SIZE = 20;

const CallHistoryPage = () => {
  const user = useAuthStore((s) => s.user);
  const [searchParams, setSearchParams] = useSearchParams();

  // Deep-linked from a contact's "View call history" menu — restricts the
  // list to calls with just that person.
  const contactIdParam = searchParams.get("contactId");
  const contactFilterId = contactIdParam ? Number(contactIdParam) : null;
  const contactFilterName = searchParams.get("contactName");

  const clearContactFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("contactId");
    next.delete("contactName");
    setSearchParams(next);
  };

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [calls, setCalls] = useState<CallHistoryRow[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  // Bumped whenever a call is logged (see CallContext's logCallOutcome ->
  // notificationStore.refresh()) -- keeps this page live if the user is
  // already sitting on it when a call ends, instead of only fetching
  // once per page-number change.
  const callLogVersion = useNotificationStore((s) => s.version);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await axiosInstance.get("/calls/history", {
          params: { page, limit: PAGE_SIZE },
        });

        setCalls(res.data.data.calls);
        setTotalPages(res.data.data.pagination.totalPages || 1);
      } catch (err) {
        console.error("Failed to fetch call history:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [page, callLogVersion, retryKey]);

  const directionOf = (call: CallHistoryRow) =>
    call.caller_id === user?.id ? "outgoing" : "incoming";

  const entries = groupCallRows(calls).filter((entry) => {
    if (entry.isGroup) {
      // Group entries match search on any participant's name; the
      // incoming/outgoing/missed filters don't cleanly apply to them
      // (you're always the one who started it), so they only show
      // under "all" or "missed" if every invite was missed.
      const anyNameMatches = entry.rows.some((r) =>
        otherPartyName(r, user?.id).toLowerCase().includes(search.toLowerCase())
      );
      const matchFilter =
        filter === "all" ||
        (filter === "missed" && entry.rows.every((r) => r.status === "missed")) ||
        filter === "outgoing";
      const matchContact =
        !contactFilterId ||
        entry.rows.some((r) => otherPartyId(r, user?.id) === contactFilterId);

      return anyNameMatches && matchFilter && matchContact;
    }

    const name = otherPartyName(entry.row, user?.id);
    const direction = directionOf(entry.row);

    const matchSearch = name.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === "all" ||
      direction === filter ||
      (filter === "missed" && entry.row.status === "missed");
    const matchContact =
      !contactFilterId || otherPartyId(entry.row, user?.id) === contactFilterId;

    return matchSearch && matchFilter && matchContact;
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#F8FAFC]">Call History</h2>
        <p className="text-[#94A3B8] text-sm mt-1">Review all your past calls</p>
      </div>

      {contactFilterId && (
        <div className="flex items-center gap-2 bg-[#06B6D4]/10 border border-[#06B6D4]/30 text-[#06B6D4] text-sm rounded-xl px-4 py-2.5 w-fit">
          <span>
            Showing calls with{" "}
            <span className="font-semibold">{contactFilterName ?? "this contact"}</span>
          </span>
          <button
            onClick={clearContactFilter}
            className="text-[#06B6D4]/70 hover:text-[#06B6D4]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search calls..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1E293B]/60 border border-[#334155]/60 rounded-xl pl-11 pr-4 py-2.5 text-[#F8FAFC] text-sm placeholder-[#334155] outline-none focus:border-[#06B6D4]/60 transition-colors"
          />
        </div>
        <div className="flex gap-1 bg-[#0F172A] border border-[#334155]/60 rounded-xl p-1">
          {["all", "incoming", "outgoing", "missed"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${
                filter === f
                  ? "bg-[#06B6D4] text-[#020617]"
                  : "text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden">
        <div className="grid grid-cols-[48px_1fr_110px_120px_90px] gap-4 px-5 py-3 border-b border-[#334155]/60">
          {["Type", "Contact", "Duration", "Status", "Time"].map((h) => (
            <span key={h} className="text-[#94A3B8] text-xs font-medium uppercase tracking-wide">
              {h}
            </span>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-[#94A3B8] text-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="py-16 text-center text-[#94A3B8] text-sm flex flex-col items-center gap-3">
            <span>Couldn't load call history.</span>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold px-4 py-2 rounded-xl text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#334155]/30">
            {entries.map((entry, i) => {
              if (entry.isGroup) {
                return (
                  <motion.div
                    key={entry.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="px-5 py-4"
                  >
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="w-8 h-8 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4 text-[#06B6D4]" />
                      </div>
                      <span className="text-[#F8FAFC] text-sm font-medium">
                        Group call · {entry.rows.length} invited
                      </span>
                      <span className="text-[#94A3B8] text-xs ml-auto whitespace-nowrap">
                        {formatRelativeTime(entry.createdAt)}
                      </span>
                    </div>

                    <div className="pl-11 space-y-1.5">
                      {entry.rows.map((row) => {
                        const name = otherPartyName(row, user?.id);
                        const status = STATUS_CONFIG[row.status] ?? {
                          label: row.status,
                          color: "text-[#94A3B8]",
                          bg: "bg-[#94A3B8]/10",
                        };

                        return (
                          <div key={row.id} className="flex items-center gap-3">
                            <CallIconButton
                              contactId={otherPartyId(row, user?.id)}
                              contactName={name}
                              icon={row.status === "missed" ? PhoneMissed : PhoneOutgoing}
                              iconClassName={`w-3.5 h-3.5 ${
                                row.status === "missed" ? "text-[#EF4444]" : "text-[#94A3B8]"
                              }`}
                              className="w-6 h-6 rounded-md bg-[#0F172A] border border-[#334155]/60 flex items-center justify-center hover:border-[#06B6D4]/60 hover:bg-[#06B6D4]/10 transition-colors shrink-0"
                            />
                            <span className="text-[#F8FAFC] text-sm flex-1 truncate">{name}</span>
                            {row.duration > 0 && (
                              <span className="text-[#94A3B8] text-xs">
                                {formatDuration(row.duration)}
                              </span>
                            )}
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                              {status.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              }

              const call = entry.row;
              const status = STATUS_CONFIG[call.status] ?? {
                label: call.status,
                color: "text-[#94A3B8]",
                bg: "bg-[#94A3B8]/10",
              };
              const direction = directionOf(call);
              const name = otherPartyName(call, user?.id);

              return (
                <motion.div
                  key={entry.key}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.03 }}
                  className="grid grid-cols-[48px_1fr_110px_120px_90px] gap-4 px-5 py-4 items-center hover:bg-[#334155]/20 transition-colors"
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
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center shrink-0">
                      <span className="text-[#94A3B8] text-xs font-bold">
                        {name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-[#F8FAFC] text-sm font-medium truncate">{name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#94A3B8] text-sm">
                    <Clock className="w-3.5 h-3.5" />
                    {call.duration > 0 ? formatDuration(call.duration) : "—"}
                  </div>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                    {status.label}
                  </span>
                  <span className="text-[#94A3B8] text-xs whitespace-nowrap">
                    {formatRelativeTime(call.created_at)}
                  </span>
                </motion.div>
              );
            })}

            {entries.length === 0 && (
              <div className="py-16 text-center text-[#94A3B8] text-sm">
                No calls found
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-9 h-9 rounded-lg bg-[#1E293B] border border-[#334155]/60 flex items-center justify-center text-[#94A3B8] disabled:opacity-40 hover:text-[#F8FAFC] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[#94A3B8] text-sm">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-lg bg-[#1E293B] border border-[#334155]/60 flex items-center justify-center text-[#94A3B8] disabled:opacity-40 hover:text-[#F8FAFC] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
};

export default CallHistoryPage;
