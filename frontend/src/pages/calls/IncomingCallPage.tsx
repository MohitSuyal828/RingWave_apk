import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Wifi,
  ShieldQuestion,
} from "lucide-react";

import { useCall } from "@/context/CallContext";
import { useEffect, useRef, useState } from "react";
import { startCallAlertRinging } from "@/lib/settings";

const IncomingCallPage = () => {
  const navigate = useNavigate();

  const { incomingCall, acceptCall, rejectCall } = useCall();

  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    const stopRinging = startCallAlertRinging(2200, () => isMutedRef.current);
    return stopRinging;
  }, []);

  const handleAccept = async () => {
    await acceptCall();
  };

  const handleReject = () => {
    rejectCall();
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center relative overflow-hidden">

      {/* Background rings (PRESERVED) */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#22C55E]/10"
            style={{ width: i * 160, height: i * 160 }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.2, 0.5, 0.2] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Glow */}
      <div className="absolute w-[400px] h-[400px] rounded-full bg-[#22C55E]/5 blur-[100px]" />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
      >

        {/* Avatar (PRESERVED STYLE) */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-[#22C55E]/40"
              animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-[#22C55E]/20"
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
            />

            <div className="relative w-28 h-28 rounded-full bg-[#1E293B] border-2 border-[#334155] flex items-center justify-center">
              <span className="text-[#F8FAFC] text-4xl font-bold">
                {incomingCall?.from?.name?.slice(0, 2)?.toUpperCase() ?? "??"}
              </span>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#F8FAFC]">
              {incomingCall?.from?.name ?? "Incoming Call"}
            </h1>
            <p className="text-[#94A3B8] text-base mt-1">
              Incoming call
            </p>

            <motion.div
              className="flex items-center gap-2 justify-center mt-3"
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <div className="w-2 h-2 rounded-full bg-[#22C55E]" />
              <span className="text-[#22C55E] text-sm font-medium">
                Incoming call...
              </span>
            </motion.div>
          </div>
        </div>

        {/* No audio stream exists yet on the ringing screen (the call
            hasn't connected), so there's nothing for the detection model
            to analyze until pickup — this neutral state is expected here,
            not a sign detection is unbuilt. Live readings appear on
            ActiveCallPage via DetectionBadge once the call connects. */}
        <div className="flex items-center gap-2.5 px-5 py-2.5 rounded-full border bg-[#334155]/10 border-[#334155]/40">
          <ShieldQuestion className="w-4 h-4 text-[#94A3B8]" />
          <span className="text-sm font-medium text-[#94A3B8]">
            Voice authenticity detection will begin once connected
          </span>
        </div>

        {/* Waveform (PRESERVED) */}
        <div className="flex items-end gap-[3px] h-10">
          {[4, 8, 12, 16, 20, 16, 24, 16, 20, 16, 12, 8, 4].map((h, i) => (
            <motion.div
              key={i}
              className="w-[3px] bg-[#06B6D4]/60 rounded-full"
              style={{ height: h }}
              animate={{ scaleY: [1, 1.6, 0.7, 1.3, 1] }}
              transition={{
                duration: 1.4,
                repeat: Infinity,
                delay: i * 0.07,
              }}
            />
          ))}
        </div>

        {/* Controls (UNCHANGED VISUAL STYLE) */}
        <div className="flex items-center gap-16 mt-4">

          <button
            onClick={handleReject}
            className="w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center"
          >
            <PhoneOff className="w-7 h-7 text-white" />
          </button>

          <button
            onClick={() => setIsMuted((m) => !m)}
            className="w-12 h-12 rounded-full bg-[#1E293B] flex items-center justify-center"
          >
            {isMuted ? (
              <VolumeX className="w-5 h-5 text-[#F59E0B]" />
            ) : (
              <Volume2 className="w-5 h-5 text-[#94A3B8]" />
            )}
          </button>

          <button
            onClick={handleAccept}
            className="w-16 h-16 rounded-full bg-[#22C55E] flex items-center justify-center"
          >
            <Phone className="w-7 h-7 text-white" />
          </button>
        </div>
      </motion.div>

      {/* Top bar (PRESERVED) */}
      <div className="absolute top-6 left-6 flex items-center gap-2">
        <Wifi className="w-4 h-4 text-[#06B6D4]" />
        <span className="text-[#F8FAFC] font-bold">
          Ring<span className="text-[#06B6D4]">Wave</span>
        </span>
      </div>
    </div>
  );
};

export default IncomingCallPage;