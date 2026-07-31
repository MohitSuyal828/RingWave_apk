import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PhoneOff, Wifi, AlertTriangle, PhoneMissed } from "lucide-react";

import { useCall } from "@/context/CallContext";

const CALLING_STATES = [
  "Connecting...",
  "Ringing...",
  "Waiting for answer...",
];

const OutgoingCallPage = () => {
  const { status, endCall, participants, isGroupCall, error, clearError } = useCall();

  const [stateIndex, setStateIndex] = useState(0);
  const failed = status === "failed";

  useEffect(() => {
    if (failed) return;

    const interval = setInterval(() => {
      setStateIndex((i) => (i < CALLING_STATES.length - 1 ? i + 1 : i));
    }, 2500);

    return () => clearInterval(interval);
  }, [failed]);

  const handleCancel = () => {
    endCall();
  };

  const names = participants.map((p) => p.user.name ?? "Unknown");
  const title = isGroupCall
    ? names.length > 2
      ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more`
      : names.join(" & ") || "Calling..."
    : names[0] ?? "Calling...";

  const initials = (isGroupCall ? "GC" : names[0]?.slice(0, 2))?.toUpperCase() ?? "??";

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden">

      {/* Ambient glow (PRESERVED) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#06B6D4]/10"
            style={{ width: i * 140, height: i * 140 }}
            animate={{ scale: [1, 1.06, 1], opacity: [0.15, 0.4, 0.15] }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.35,
            }}
          />
        ))}
      </div>

      {error && !failed && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-sm rounded-xl px-4 py-3 max-w-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[#EF4444]/70 hover:text-[#EF4444]">
            ✕
          </button>
        </div>
      )}

      <motion.div
        className="relative z-10 flex flex-col items-center gap-10"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
      >

        {/* Avatar */}
        <div className={`w-28 h-28 rounded-full bg-[#1E293B] border-2 flex items-center justify-center ${failed ? "border-[#EF4444]/40" : "border-[#334155]"}`}>
          {failed ? (
            <PhoneMissed className="w-10 h-10 text-[#EF4444]" />
          ) : (
            <span className="text-[#F8FAFC] text-4xl font-bold">{initials}</span>
          )}
        </div>

        {/* Info */}
        <h1 className="text-3xl font-bold text-[#F8FAFC] text-center max-w-md">
          {title}
        </h1>

        {isGroupCall && !failed && (
          <p className="text-[#94A3B8] text-sm -mt-6">
            {participants.length} people invited
          </p>
        )}

        {/* State text */}
        {failed ? (
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#EF4444] text-base font-medium -mt-4"
          >
            {error ?? "Call failed."}
          </motion.p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.p
              key={stateIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-[#06B6D4] text-sm font-medium"
            >
              {CALLING_STATES[stateIndex]}
            </motion.p>
          </AnimatePresence>
        )}

        {/* animated dots (PRESERVED) */}
        {!failed && (
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#06B6D4]"
                animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />
            ))}
          </div>
        )}

        {/* Cancel */}
        <button
          onClick={handleCancel}
          className="mt-6 w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center"
        >
          <PhoneOff className="w-7 h-7 text-white" />
        </button>
      </motion.div>

      {/* Top bar */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <Wifi className="w-4 h-4 text-[#06B6D4]" />
        <span className="text-[#F8FAFC] font-bold">
          Ring<span className="text-[#06B6D4]">Wave</span>
        </span>
      </div>
    </div>
  );
};

export default OutgoingCallPage;
