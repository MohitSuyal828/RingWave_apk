import { create } from "zustand";
import type { Call, DetectionEvent } from "@/types";

interface CallState {
  activeCall: Call | null;
  incomingCall: Call | null;
  isMuted: boolean;
  isSpeakerOn: boolean;
  detectionEvents: DetectionEvent[];
  callDuration: number;

  setActiveCall: (call: Call | null) => void;
  setIncomingCall: (call: Call | null) => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  addDetectionEvent: (event: DetectionEvent) => void;
  clearDetectionEvents: () => void;
  incrementDuration: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallState>()((set) => ({
  activeCall: null,
  incomingCall: null,
  isMuted: false,
  isSpeakerOn: false,
  detectionEvents: [],
  callDuration: 0,

  setActiveCall: (call) => set({ activeCall: call }),
  setIncomingCall: (call) => set({ incomingCall: call }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  toggleSpeaker: () => set((s) => ({ isSpeakerOn: !s.isSpeakerOn })),
  addDetectionEvent: (event) =>
    set((s) => ({ detectionEvents: [...s.detectionEvents, event] })),
  clearDetectionEvents: () => set({ detectionEvents: [] }),
  incrementDuration: () => set((s) => ({ callDuration: s.callDuration + 1 })),
  resetCall: () =>
    set({
      activeCall: null,
      isMuted: false,
      isSpeakerOn: false,
      detectionEvents: [],
      callDuration: 0,
    }),
}));