import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mic, MicOff, Volume2, VolumeX,
  PhoneOff, Wifi, AlertTriangle, UserPlus,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatDuration } from "@/lib/utils";
import { useCall } from "@/context/CallContext";
import { AddParticipantModal } from "@/components/AddParticipantModal";
import { DetectionBadge } from "@/components/DetectionBadge";
import { CallVerificationBadge } from "@/components/CallVerificationBadge";
import { useCallVerificationCode } from "@/hooks/useCallVerificationCode";

const ActiveCallPage = () => {
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const navigate = useNavigate();
  const {
    participants,
    duration,
    isMuted,
    toggleMute,
    endCall,
    error,
    clearError,
    callId,
  } = useCall();

  const [showAddParticipant, setShowAddParticipant] = useState(false);

  const peer = participants[0]?.user;
  const remoteStream = participants[0]?.stream ?? null;
  const connectionState = participants[0]?.connectionState ?? "pending";

  const { status: verificationStatus, code: verificationCode } =
    useCallVerificationCode(peer?.id ?? null, callId);

  const peerName = peer?.name ?? "Unknown";
  const peerUsername = peer?.username;
  const peerInitials = peerName.slice(0, 2).toUpperCase();

  const [isSpeakerOn, setIsSpeakerOn] = useState(true);

  useEffect(() => {
    if (!remoteAudioRef.current || !remoteStream) return;

    remoteAudioRef.current.srcObject = remoteStream;
    remoteAudioRef.current.play().catch(() => {});
  }, [remoteStream]);

  const handleEndCall = () => {
    endCall();
    navigate(ROUTES.DASHBOARD);
  };

  const waveHeights = [6, 10, 16, 22, 28, 22, 32, 22, 28, 22, 16, 10, 6];

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col relative overflow-hidden">

      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-1000"
        style={{
          background:
            "radial-gradient(circle at 50% 40%, rgba(6,182,212,0.05) 0%, transparent 60%)",
        }}
      />

      {/* Topbar */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#0F172A]/80 backdrop-blur border-b border-[#334155]/60">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#06B6D4]/10 border border-[#06B6D4]/30 flex items-center justify-center">
            <Wifi className="w-3.5 h-3.5 text-[#06B6D4]" />
          </div>
          <span className="text-[#F8FAFC] font-bold">
            Ring<span className="text-[#06B6D4]">Wave</span>
          </span>
        </div>
        <div className="flex items-center gap-2 bg-[#1E293B] border border-[#334155]/60 rounded-full px-3 py-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
          <span className="text-[#F8FAFC] text-sm font-mono font-medium">
            {formatDuration(duration)}
          </span>
        </div>
        <div className="text-[#94A3B8] text-sm capitalize">
          {connectionState}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-sm rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={clearError} className="text-[#EF4444]/70 hover:text-[#EF4444]">
            ✕
          </button>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">

        {/* Caller */}
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="relative">
            {[1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(34,197,94,0.2)" }}
                animate={{ scale: [1, 1.4 + i * 0.2, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
              />
            ))}
            <div className="w-24 h-24 rounded-full bg-[#1E293B] border-2 border-[#334155] flex items-center justify-center">
              <span className="text-[#F8FAFC] text-3xl font-bold">{peerInitials}</span>
            </div>
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-[#F8FAFC]">{peerName}</h1>
            <p className="text-[#94A3B8] text-sm mt-1">
              {peerUsername ? `@${peerUsername} · In call` : "In call"}
            </p>
          </div>
        </motion.div>

        {/* Live voice-authenticity verdict — see DetectionBadge for how
            this reads CallContext's detectionState/detectionConfidence,
            which are driven by DetectionTransport's messages from the
            detection service (real Stage 1 model inference via
            ai-service/app/predictor.py). */}
        <DetectionBadge />

        <CallVerificationBadge
          status={verificationStatus}
          code={verificationCode}
          peerName={peerName}
        />

        {/* Waveform */}
        <div className="flex items-end gap-[3px] h-12">
          {waveHeights.map((h, i) => (
            <motion.div
              key={i}
              className={`w-[4px] rounded-full ${
                isMuted ? "bg-[#334155]" : "bg-[#06B6D4]"
              }`}
              style={{ height: h }}
              animate={isMuted ? { scaleY: 1 } : { scaleY: [1, 1.8, 0.6, 1.5, 1] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                delay: i * 0.06,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-6">
          <motion.div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-colors ${
                isMuted
                  ? "bg-[#F59E0B]/10 border-[#F59E0B]/60 text-[#F59E0B]"
                  : "bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
              whileTap={{ scale: 0.92 }}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </motion.button>
            <span className="text-[#94A3B8] text-xs">
              {isMuted ? "Unmute" : "Mute"}
            </span>
          </motion.div>

          <motion.div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={handleEndCall}
              className="w-16 h-16 rounded-full bg-[#EF4444] flex items-center justify-center"
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              style={{ boxShadow: "0 0 28px rgba(239,68,68,0.35)" }}
            >
              <PhoneOff className="w-7 h-7 text-white" />
            </motion.button>
            <span className="text-[#94A3B8] text-sm">End Call</span>
          </motion.div>

          <motion.div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={() => setIsSpeakerOn((s) => !s)}
              className={`w-14 h-14 rounded-full border-2 flex items-center justify-center transition-colors ${
                isSpeakerOn
                  ? "bg-[#06B6D4]/10 border-[#06B6D4]/60 text-[#06B6D4]"
                  : "bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
              whileTap={{ scale: 0.92 }}
            >
              {isSpeakerOn ? (
                <Volume2 className="w-6 h-6" />
              ) : (
                <VolumeX className="w-6 h-6" />
              )}
            </motion.button>
            <span className="text-[#94A3B8] text-xs">
              {isSpeakerOn ? "Speaker" : "Earpiece"}
            </span>
          </motion.div>
          <motion.div className="flex flex-col items-center gap-2">
            <motion.button
              onClick={() => setShowAddParticipant(true)}
              className="w-14 h-14 rounded-full border-2 bg-[#1E293B] border-[#334155] text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center transition-colors"
              whileTap={{ scale: 0.92 }}
            >
              <UserPlus className="w-6 h-6" />
            </motion.button>
            <span className="text-[#94A3B8] text-xs">Add</span>
          </motion.div>
        </div>
      </div>

      {showAddParticipant && (
        <AddParticipantModal onClose={() => setShowAddParticipant(false)} />
      )}

      <audio ref={remoteAudioRef} autoPlay muted={!isSpeakerOn} />
    </div>
  );
};

export default ActiveCallPage;
