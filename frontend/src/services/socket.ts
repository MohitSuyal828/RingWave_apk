import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/store/authStore";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string;

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    const token = useAuthStore.getState().accessToken;
    socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket"],
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socket.on("connect", () => {
      console.log("[Socket] Connected:", socket?.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("[Socket] Disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("[Socket] Connect Error:", error);
    });
  }
  return socket;
};

export const connectSocket = (): void => {
  const s = getSocket();
  s.auth = {
    token: useAuthStore.getState().accessToken,
  };
  if (!s.connected) {
    s.connect();
  }
};

export const disconnectSocket = (): void => {
  if (socket?.connected) {
    socket.disconnect();
    socket = null;
  }
};

// ─── Socket event constants ───────────────────────────────────────────────────
export const SOCKET_EVENTS = {
  // Call events
  CALL_OUTGOING: "call:outgoing",
  CALL_INCOMING: "call:incoming",
  CALL_ACCEPTED: "call:accepted",
  CALL_REJECTED: "call:rejected",
  CALL_ENDED: "call:ended",
  CALL_PARTICIPANT_JOINED: "call:participant_joined",
  CALL_PARTICIPANT_LEFT: "call:participant_left",
  CALL_INVITE: "call:invite",
  CALL_INVITE_SENT: "call:invite_sent",

  // Detection events
  DETECTION_UPDATE: "detection:update",
  DETECTION_ALERT: "detection:alert",

  // Contact events
  CONTACT_REQUEST: "contact:request",
  CONTACT_ACCEPTED: "contact:accepted",
  CONTACT_ONLINE: "contact:online",
  CONTACT_OFFLINE: "contact:offline",

  // Notification events
  NOTIFICATION_NEW: "notification:new",

  // WebRTC signaling
  SIGNAL_OFFER: "signal:offer",
  SIGNAL_ANSWER: "signal:answer",
  SIGNAL_ICE: "signal:ice",

  CALL_BUSY: "call:busy",
  CALL_ICE_CANDIDATE: "call:ice-candidate",
} as const;