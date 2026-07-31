import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldQuestion, Sparkles, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { axiosInstance } from "@/services/axios";
import { formatRelativeTime } from "@/lib/utils";
import {
  DETECTION_CONFIG,
  mapPredictionToDetectionState,
} from "@/constants/detection";

interface DetectionLogRow {
  id: number;
  user_id: number;
  prediction: string;
  confidence_score: number;
  created_at: string;
  call_session_id: string | null;
  other_user_id: number | null;
  other_user_name: string | null;
  other_user_email: string | null;
}

const PAGE_SIZE = 20;

const DetectionReportsPage = () => {
  const [detections, setDetections] = useState<DetectionLogRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await axiosInstance.get("/detections/history", {
          params: { page, limit: PAGE_SIZE },
        });

        setDetections(res.data.data.detections);
        setTotalPages(res.data.data.pagination.totalPages || 1);
      } catch (err) {
        console.error("Failed to fetch detection history:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [page, retryKey]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-[#F8FAFC]">Detection Reports</h2>
        <p className="text-[#94A3B8] text-sm mt-1">
          AI voice-authenticity analysis from your calls
        </p>
      </div>

      {!loading && error ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-10 flex flex-col items-center text-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#334155]/20 border border-[#334155]/60 flex items-center justify-center">
            <ShieldQuestion className="w-8 h-8 text-[#94A3B8]" />
          </div>
          <div className="max-w-md">
            <h3 className="text-[#F8FAFC] font-semibold text-lg">
              Couldn't load detection reports
            </h3>
            <p className="text-[#94A3B8] text-sm mt-2">
              Something went wrong fetching your detection history.
            </p>
          </div>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="bg-[#06B6D4] hover:bg-[#06B6D4]/90 text-[#020617] font-semibold px-4 py-2 rounded-xl text-sm transition-colors"
          >
            Retry
          </button>
        </motion.div>
      ) : !loading && detections.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl p-10 flex flex-col items-center text-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#334155]/20 border border-[#334155]/60 flex items-center justify-center">
            <ShieldQuestion className="w-8 h-8 text-[#94A3B8]" />
          </div>

          <div className="max-w-md">
            <h3 className="text-[#F8FAFC] font-semibold text-lg">
              No detection reports yet
            </h3>
            <p className="text-[#94A3B8] text-sm mt-2">
              Voice-authenticity readings are captured automatically during
              your calls. Once you've been on a call with detection running,
              the results will show up here.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs text-[#475569] mt-2">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Predictions come from RingWave's Stage 1 voice-authenticity model, running in real time during your calls</span>
          </div>
        </motion.div>
      ) : (
        <>
          <div className="bg-[#1E293B]/60 backdrop-blur border border-[#334155]/60 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_140px_160px] gap-4 px-5 py-3 border-b border-[#334155]/60">
              {["Verdict", "Call", "Confidence", "Time"].map((h) => (
                <span
                  key={h}
                  className="text-[#94A3B8] text-xs font-medium uppercase tracking-wide"
                >
                  {h}
                </span>
              ))}
            </div>

            {loading ? (
              <div className="py-16 text-center text-[#94A3B8] text-sm">
                Loading...
              </div>
            ) : (
              <div className="divide-y divide-[#334155]/30">
                {detections.map((row, i) => {
                  const state = mapPredictionToDetectionState(row.prediction);
                  const config = DETECTION_CONFIG[state];
                  const Icon = config.icon;

                  return (
                    <motion.div
                      key={row.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="grid grid-cols-[1fr_1fr_140px_160px] gap-4 px-5 py-4 items-center hover:bg-[#334155]/20 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg ${config.bg} border ${config.border} flex items-center justify-center shrink-0`}
                        >
                          <Icon className={`w-4 h-4 ${config.color}`} />
                        </div>
                        <span className={`text-sm font-medium ${config.color}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="min-w-0">
                        {row.other_user_name ? (
                          <span className="text-[#F8FAFC] text-sm truncate block">
                            {row.other_user_name}
                          </span>
                        ) : row.call_session_id ? (
                          <span className="flex items-center gap-1.5 text-[#94A3B8] text-sm">
                            <Users className="w-3.5 h-3.5 shrink-0" />
                            Group call
                          </span>
                        ) : (
                          <span className="text-[#475569] text-sm">—</span>
                        )}
                      </div>
                      <span className="text-[#94A3B8] text-sm">
                        {Number(row.confidence_score).toFixed(1)}%
                      </span>
                      <span className="text-[#94A3B8] text-xs whitespace-nowrap">
                        {formatRelativeTime(row.created_at)}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>

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
        </>
      )}
    </div>
  );
};

export default DetectionReportsPage;
