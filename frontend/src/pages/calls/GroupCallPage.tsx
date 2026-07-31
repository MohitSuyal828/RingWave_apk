import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Mic, MicOff, Volume2, VolumeX,
  PhoneOff, Wifi, AlertTriangle, UserPlus,
} from "lucide-react";
import { ROUTES } from "@/constants/routes";
import { formatDuration } from "@/lib/utils";
import { useCall, type Participant, type ParticipantStatus } from "@/context/CallContext";
import { AddParticipantModal } from "@/components/AddParticipantModal";
import { DetectionBadge } from "@/components/DetectionBadge";
import { useEffect, useRef, useState } from "react";

const initialsOf = (name?: string) =>
  (name ?? "?").slice(0, 2).toUpperCase();

const statusLabel: Record<ParticipantStatus, string> = {
  ringing: "Ringing…",
  connecting: "Connecting…",
  connected: "Connected",
  declined: "Declined",
  no_answer: "Didn't pick up",
  offline: "Unreachable",
};

const statusColor: Record<ParticipantStatus, string> = {
  ringing: "text-[#06B6D4]",
  connecting: "text-[#94A3B8]",
  connected: "text-[#22C55E]",
  declined: "text-[#F59E0B]",
  no_answer: "text-[#F59E0B]",
  offline: "text-[#EF4444]",
};

function ParticipantTile({ participant }: { participant: Participant }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!audioRef.current || !participant.stream) return;
    audioRef.current.srcObject = participant.stream;
    audioRef.current.play().catch(() => {});
  }, [participant.stream]);

  const isConnected = participant.status === "connected";
  const isRinging = participant.status === "ringing";
  const isUnreachable =
    participant.status === "declined" ||
    participant.status === "no_answer" ||
    participant.status === "offline";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: isUnreachable ? 0.6 : 1, scale: 1 }}
      className={`bg-[#1E293B]/60 border rounded-2xl p-5 flex flex-col items-center gap-3 ${
        isUnreachable ? "border-[#F59E0B]/30" : "border-[#334155]/60"
      }`}
    >
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-[#22C55E]/30"
          animate={
            isConnected
              ? { scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }
              : { opacity: 0 }
          }
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        {isRinging && (
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-[#06B6D4]/40"
            animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        <div className="w-16 h-16 rounded-full bg-[#0F172A] border border-[#334155] flex items-center justify-center">
          <span className="text-[#F8FAFC] font-bold">
            {initialsOf(participant.user.name)}
          </span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-[#F8FAFC] text-sm font-medium truncate max-w-[10rem]">
          {participant.user.name ?? `User #${participant.user.id}`}
        </p>
        <p className={`text-xs mt-0.5 ${statusColor[participant.status]}`}>
          {statusLabel[participant.status]}
        </p>
      </div>

      <audio ref={audioRef} autoPlay />
    </motion.div>
  );
}

const GroupCallPage = () => {
  const navigate = useNavigate();
  const {
    participants,
    duration,
    isMuted,
    toggleMute,
    endCall,
    error,
    clearError,
  } = useCall();

  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [showAddParticipant, setShowAddParticipant] = useState(false);

  // Someone showing "Declined" / "Didn't pick up" / "Unreachable" isn't
  // actually on the call — their tile just sticks around briefly so the
  // outcome is visible. Don't count them toward "N on the call".
  const activeCount = participants.filter(
    (p) => p.status !== "declined" && p.status !== "no_answer" && p.status !== "offline"
  ).length;

  const handleEndCall = () => {
    endCall();
    navigate(ROUTES.DASHBOARD);
  };

  return (
    <div className="min-h-screen bg-[#020617] flex flex-col relative overflow-hidden">
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

        <div className="text-[#94A3B8] text-sm">
          {activeCount + 1} on the call
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

      {/* Live voice-authenticity verdict — see DetectionBadge / ActiveCallPage
          for the full explanation of what drives this. */}
      <DetectionBadge className="mx-6 mt-4 w-fit" />


      {/* Participant grid */}
      <div className="flex-1 p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 content-start">
        {participants.map((p) => (
          <ParticipantTile key={p.user.id} participant={p} />
        ))}

        {participants.length === 0 && (
          <div className="col-span-full text-center py-16 text-[#94A3B8]">
            Waiting for others to join…
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="border-t border-[#334155]/60 bg-[#0F172A]/80 backdrop-blur px-6 py-5 flex items-center justify-center gap-6">
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
          <span className="text-[#94A3B8] text-sm">Leave</span>
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
            {isSpeakerOn ? "Speaker" : "Muted output"}
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

      {showAddParticipant && (
        <AddParticipantModal onClose={() => setShowAddParticipant(false)} />
      )}
    </div>
  );
};

export default GroupCallPage;
