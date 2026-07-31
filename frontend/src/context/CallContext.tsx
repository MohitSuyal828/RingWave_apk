import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  getSocket,
  connectSocket,
  disconnectSocket,
  SOCKET_EVENTS,
} from "@/services/socket";
import { axiosInstance } from "@/services/axios";
import { WebRTCManager } from "@/lib/WebRTCManager";
import { AudioChunker, type AudioChunk } from "@/lib/audio/AudioChunker";
import {
  DetectionTransport,
  type DetectionConnectionState,
} from "@/services/detectionTransport";
import { isDetectionVerdictMessage } from "@/services/detectionProtocol";
import {
  mapPredictionToDetectionState,
  type DetectionState,
} from "@/constants/detection";
import { useAuthStore } from "@/store/authStore";
import { useNotificationStore } from "@/store/notificationStore";
import { getSettings } from "@/lib/settings";

// ======================================================
// Types
// ======================================================

export type CallStatus =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "failed";

export interface CallUser {
  id: number;
  name?: string;
  username?: string;
  avatar?: string;
}

export interface Participant {
  user: CallUser;
  stream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  /** Distinct from `connectionState` (which is purely WebRTC-level and
   *  doesn't exist until an offer/answer has been exchanged). This covers
   *  the pre-connection lifecycle too — someone can be "ringing" for up to
   *  60s, or end up "declined"/"no_answer" without ever having a peer
   *  connection at all. */
  status: ParticipantStatus;
}

export type ParticipantStatus =
  | "ringing"
  | "connecting"
  | "connected"
  | "declined"
  | "no_answer"
  | "offline";

interface IncomingCall {
  callId: string;
  from: CallUser;
  isGroup: boolean;
}

// ======================================================
// Context Shape
// ======================================================

interface CallContextValue {
  status: CallStatus;
  isInCall: boolean;
  callId: string | null;
  isGroupCall: boolean;

  incomingCall: IncomingCall | null;

  /** Remote participants only (never includes the local user). */
  participants: Participant[];

  localStream: MediaStream | null;

  /** Live voice-authenticity verdict for the current call, driven by
   *  DetectionTransport's messages from the detection service. "analyzing"
   *  until the first verdict arrives (or if the transport isn't
   *  connected/configured at all) — see DETECTION_CONFIG for how each
   *  state renders. */
  detectionState: DetectionState;
  /** 0-100 confidence for `detectionState`'s prediction, or null before
   *  the first verdict arrives. */
  detectionConfidence: number | null;

  duration: number;
  isMuted: boolean;
  isMicOn: boolean;

  /** Non-fatal call errors — busy/declined/connection failed/mic denied,
   *  or a transient note about one person in a group call. */
  error: string | null;
  clearError: () => void;

  startCall: (users: CallUser[]) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleMic: () => void;
  /** Adds someone to an already-active call — turns a 1:1 call into a
   *  group call, or adds to one already going. */
  inviteToCall: (user: CallUser) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// ======================================================
// Reason -> human message
// ======================================================

const reasonMessage = (reason: string, who: string) => {
  const subject = who === "They" ? "are" : "is";
  const subjectNeg = who === "They" ? "aren't" : "isn't";

  switch (reason) {
    case "offline":
      return `${who} ${subjectNeg} online right now.`;
    case "busy":
      return `${who} ${subject} on another call.`;
    case "no_answer":
      return `${who} ${subjectNeg} responding.`;
    case "timeout":
      return `${who} ${subjectNeg} responding.`;
    default:
      return `${who} declined the call.`;
  }
};

// ======================================================
// Provider
// ======================================================

export function CallProvider({ children }: { children: ReactNode }) {
  const socket = getSocket();
  const user = useAuthStore((s) => s.user);

  // ------------------------------------------------------
  // State
  // ------------------------------------------------------

  const [status, setStatus] = useState<CallStatus>("idle");
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [participants, setParticipants] = useState<Map<number, Participant>>(
    new Map()
  );
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [detectionState, setDetectionState] = useState<DetectionState>("analyzing");
  const [detectionConfidence, setDetectionConfidence] = useState<number | null>(null);
  const [isMicOn, setIsMicOn] = useState(true);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [callId, setCallIdState] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // ------------------------------------------------------
  // Refs — long-lived socket listeners read from these instead of
  // closing over state, so the listener-registration effect only needs
  // to run once. Also used for end-of-call logging and to guard delayed
  // ("reveal after N seconds") callbacks against a call that's already
  // been reset by the time they fire.
  // ------------------------------------------------------

  const statusRef = useRef(status);
  const userIdRef = useRef<number | undefined>(user?.id);
  const callIdRef = useRef<string | null>(null);
  const durationRef = useRef(0);
  /** IDs of people *I* invited into this call — either the original
   *  startCall() invitees, or anyone I added mid-call via inviteToCall().
   *  Logging is scoped to this set (not "am I the original initiator")
   *  so that when a non-initiator adds someone to a group call, that
   *  invite's outcome still gets logged by the person who actually sent
   *  it, instead of silently being dropped by everyone. */
  const invitedByMeIds = useRef<Set<number>>(new Set());
  const everConnectedIds = useRef<Set<number>>(new Set());
  const loggedPeerIds = useRef<Set<number>>(new Set());
  const resetCallRef = useRef<() => void>(() => {});
  const participantsRef = useRef(participants);
  const generationRef = useRef(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    userIdRef.current = user?.id;
  }, [user?.id]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  /** Keeps callIdRef (synchronous) and callId state (reactive) in sync. */
  const setCallId = useCallback((id: string | null) => {
    callIdRef.current = id;
    setCallIdState(id);
  }, []);

  // ------------------------------------------------------
  // Call history logging (best-effort, fire-and-forget).
  //
  // Only the initiator logs — the row is visible in both users' history
  // via the caller_id/receiver_id OR clause in the backend. call_session_id
  // ties multiple rows from the same group call together in the UI.
  // ------------------------------------------------------

  const logCallOutcome = useCallback(
    (receiverId: number, status: "completed" | "missed" | "rejected") => {
      if (!invitedByMeIds.current.has(receiverId)) return;
      if (loggedPeerIds.current.has(receiverId)) return;

      loggedPeerIds.current.add(receiverId);

      axiosInstance
        .post("/calls", {
          receiver_id: receiverId,
          duration: status === "completed" ? durationRef.current : 0,
          status,
          call_session_id: callIdRef.current ?? undefined,
        })
        .then(() => {
          // Keep the Topbar badge / Notifications page in sync with what
          // just got written — without this, the notification store's
          // cached batch never learns a new call happened until a full
          // page reload re-triggers its one-time fetch.
          useNotificationStore.getState().refresh(userIdRef.current);
        })
        .catch((err) => {
          console.warn("[CallContext] Failed to log call outcome", err);
        });
    },
    []
  );

  // ------------------------------------------------------
  // WebRTC mesh manager (created once)
  // ------------------------------------------------------

  const rtcRef = useRef<WebRTCManager | null>(null);

  // AI voice-detection audio capture (capture-only milestone).
  //
  // This taps the same local MediaStream WebRTCManager already manages --
  // it does not obtain its own mic stream, does not touch anything
  // WebRTCManager sends over the peer connection, and produces chunks
  // that nothing currently consumes. It exists so the next milestone (AI
  // inference) has fixed-length audio chunks to plug into; see the
  // onChunk callback below for the exact hand-off point that milestone
  // will replace.
  const audioChunkerRef = useRef<AudioChunker | null>(null);

  // Transport for those chunks to the (not-yet-existing) Python detection
  // service. Kept fully independent of AudioChunker and WebRTCManager --
  // it only ever receives already-produced AudioChunk objects via
  // sendChunk() below, and its connection lifecycle is driven from the
  // same two points as audioChunker's (start on local stream, stop on
  // resetCall) without either object knowing the other exists.
  const detectionTransportRef = useRef<DetectionTransport | null>(null);

  if (!detectionTransportRef.current) {
    detectionTransportRef.current = new DetectionTransport({
      onStateChange: (state: DetectionConnectionState) => {
        if (import.meta.env.DEV) {
          console.debug("[DetectionTransport] state:", state);
        }
      },
      onError: (err) => {
        // Detection transport is a secondary feature riding along the
        // call -- a failure here must never surface as a call error or
        // interrupt the call.
        console.warn("[DetectionTransport] error (non-fatal to the call):", err);
      },
      onServerMessage: (data) => {
        if (isDetectionVerdictMessage(data)) {
          setDetectionState(mapPredictionToDetectionState(data.prediction));
          setDetectionConfidence(data.confidence_score);

          // Persist the verdict so it shows up in Detection Reports and
          // feeds the Dashboard's voice-analysis stats. Best-effort,
          // fire-and-forget -- same pattern as logCallOutcome below: a
          // failed write here must never surface as a call error or
          // interrupt the call.
          //
          // call_session_id/other_user_id let Detection Reports show WHO
          // this verdict happened during a call with, not just a bare
          // timestamp. Read via refs (callIdRef, participantsRef), not the
          // participants/callId state directly -- this callback lives
          // inside a useRef initializer that only runs once, so closing
          // over the state variables directly would freeze them at
          // whatever they were on the very first render.
          //
          // other_user_id is only set for a 1:1 call (exactly one other
          // participant) -- for a group call there are multiple people on
          // the line and no single one of them is "the" other party, so
          // this is deliberately left null rather than guessing which
          // participant to attribute it to.
          {
            const currentParticipants = Array.from(participantsRef.current.values());
            const otherUserId =
              currentParticipants.length === 1
                ? currentParticipants[0].user.id
                : null;

            axiosInstance
              .post("/detections", {
                prediction: data.prediction,
                confidence_score: data.confidence_score,
                call_session_id: callIdRef.current ?? undefined,
                other_user_id: otherUserId,
              })
              .catch((err) => {
                console.warn("[CallContext] Failed to log detection verdict", err);
              });
          }

          return;
        }

        // Anything else (auth_ack/auth_error are handled internally by
        // DetectionTransport and never reach here) is unrecognized at
        // this milestone — logged rather than silently dropped, so a
        // protocol mismatch is discoverable during development.
        if (import.meta.env.DEV) {
          console.debug("[DetectionTransport] unrecognized server message:", data);
        }
      },
    });
  }

  if (!audioChunkerRef.current) {
    audioChunkerRef.current = new AudioChunker({
      onChunk: (chunk: AudioChunk) => {
        // Hand each finished 4-second chunk straight to the transport.
        // sendChunk() itself decides whether to send now or queue,
        // depending on connection state -- nothing here needs to know
        // that.
        detectionTransportRef.current?.sendChunk(chunk);
      },
      onError: (err) => {
        // Capture is a secondary feature riding along the call -- a
        // failure here must never surface as a call error or interrupt
        // the call.
        console.warn("[AudioChunker] capture unavailable for this call:", err);
      },
    });
  }

  if (!rtcRef.current) {
    rtcRef.current = new WebRTCManager({
      onLocalStream: (stream) => {
        setLocalStream(stream);
        // Start chunk capture and open the detection transport together,
        // as soon as the mic stream WebRTC will use is available -- same
        // stream, read-only tap, no effect on the call. Gated behind the
        // Settings page's "AI deepfake detection" toggle -- turning that
        // off means this call's audio is never captured or sent for
        // analysis at all, not just that the badge is hidden.
        if (getSettings().aiDetectionEnabled) {
          audioChunkerRef.current?.start(stream);
          detectionTransportRef.current?.connect();
        }
      },

      onRemoteStream: (peerId, stream) => {
        setParticipants((prev) => {
          const existing = prev.get(peerId);
          if (!existing) return prev;

          const next = new Map(prev);
          next.set(peerId, { ...existing, stream });
          return next;
        });
      },

      onIceCandidate: (peerId, candidate) => {
        if (!callIdRef.current) return;

        getSocket().emit(SOCKET_EVENTS.SIGNAL_ICE, {
          callId: callIdRef.current,
          to: peerId,
          candidate,
        });
      },

      onConnectionStateChange: (peerId, state) => {
        setParticipants((prev) => {
          const existing = prev.get(peerId);
          if (!existing) return prev;

          const next = new Map(prev);
          next.set(peerId, {
            ...existing,
            connectionState: state,
            status: state === "connected" ? "connected" : existing.status,
          });
          return next;
        });

        if (state === "connected") {
          everConnectedIds.current.add(peerId);
          setStatus("connected");
        }

        if (state === "failed" || state === "closed") {
          rtcRef.current?.removePeer(peerId);

          setParticipants((prev) => {
            if (!prev.has(peerId)) return prev;

            const next = new Map(prev);
            next.delete(peerId);

            if (next.size === 0) {
              if (statusRef.current === "connected") {
                setError("Connection lost — check your network and try again.");
              } else {
                setError("Couldn't establish a connection. A TURN server may be required on restrictive networks.");
              }
              queueMicrotask(() => resetCallRef.current());
            }

            return next;
          });
        }
      },
    });
  }

  const rtc = rtcRef.current;
  const audioChunker = audioChunkerRef.current!;
  const detectionTransport = detectionTransportRef.current!;

  // ======================================================
  // Reset helper
  // ======================================================

  const resetCall = useCallback(() => {
    generationRef.current += 1;

    // Log anything that didn't already get an explicit outcome
    // (e.g. the other side just never answered).
    for (const peerId of participants.keys()) {
      if (loggedPeerIds.current.has(peerId)) continue;
      logCallOutcome(
        peerId,
        everConnectedIds.current.has(peerId) ? "completed" : "missed"
      );
    }

    rtc.cleanup();
    audioChunker.stop();
    detectionTransport.disconnect();

    setCallId(null);
    invitedByMeIds.current = new Set();
    everConnectedIds.current = new Set();
    loggedPeerIds.current = new Set();

    setStatus("idle");
    setIsGroupCall(false);
    setIncomingCall(null);
    setParticipants(new Map());
    setLocalStream(null);
    setIsMicOn(true);
    setDetectionState("analyzing");
    setDetectionConfidence(null);
  }, [rtc, audioChunker, detectionTransport, participants, logCallOutcome, setCallId]);

  useEffect(() => {
    resetCallRef.current = resetCall;
  }, [resetCall]);

  // ======================================================
  // Start Call (1:1 if one user, group if more)
  // ======================================================

  const startCall = useCallback(
    async (usersToCall: CallUser[]) => {
      if (!socket || !user || usersToCall.length === 0) return;

      setError(null);
      invitedByMeIds.current = new Set(usersToCall.map((u) => u.id));
      setStatus("calling");
      setIsGroupCall(usersToCall.length > 1);

      setParticipants(
        new Map(
          usersToCall.map((u) => [
            u.id,
            {
              user: u,
              stream: null,
              connectionState: "new" as RTCPeerConnectionState,
              status: "ringing" as ParticipantStatus,
            },
          ])
        )
      );

      socket.emit(SOCKET_EVENTS.CALL_OUTGOING, {
        to: usersToCall.map((u) => ({ id: u.id, name: u.name })),
        callerName: user.name,
      });
    },
    [socket, user]
  );

  // ======================================================
  // Accept / Reject
  // ======================================================

  const rejectCall = useCallback(() => {
    if (!socket || !incomingCall) return;

    socket.emit(SOCKET_EVENTS.CALL_REJECTED, {
      callId: incomingCall.callId,
    });

    resetCall();
  }, [socket, incomingCall, resetCall]);

  const endCall = useCallback(() => {
    const id = callIdRef.current;

    if (!socket || !id) {
      resetCall();
      return;
    }

    socket.emit(SOCKET_EVENTS.CALL_ENDED, { callId: id });

    resetCall();
  }, [socket, resetCall]);

  const toggleMic = useCallback(() => {
    const enabled = !isMicOn;
    rtc.setMicrophoneEnabled(enabled);
    setIsMicOn(enabled);
  }, [rtc, isMicOn]);

  const toggleMute = toggleMic;

  const acceptCall = useCallback(async () => {
    if (!socket || !incomingCall) return;

    setError(null);
    setStatus("connecting");
    setIsGroupCall(incomingCall.isGroup);
    setCallId(incomingCall.callId);

    socket.emit(SOCKET_EVENTS.CALL_ACCEPTED, {
      callId: incomingCall.callId,
    });

    setParticipants(
      new Map([
        [
          incomingCall.from.id,
          {
            user: incomingCall.from,
            stream: null,
            connectionState: "new" as RTCPeerConnectionState,
            status: "connecting" as ParticipantStatus,
          },
        ],
      ])
    );

    setIncomingCall(null);
  }, [socket, incomingCall, setCallId]);

  // ======================================================
  // Invite someone into an already-active call
  // ======================================================

  const inviteToCall = useCallback(
    (userToInvite: CallUser) => {
      if (!socket || !callIdRef.current) return;

      setIsGroupCall(true);
      invitedByMeIds.current.add(userToInvite.id);

      setParticipants((prev) => {
        if (prev.has(userToInvite.id)) return prev;

        const next = new Map(prev);
        next.set(userToInvite.id, {
          user: userToInvite,
          stream: null,
          connectionState: "new",
          status: "ringing",
        });
        return next;
      });

      socket.emit(SOCKET_EVENTS.CALL_INVITE, {
        callId: callIdRef.current,
        to: { id: userToInvite.id, name: userToInvite.name },
      });
    },
    [socket]
  );

  // ======================================================
  // SOCKET LISTENERS — bound once for the provider's lifetime.
  // ======================================================

  useEffect(() => {
    if (!socket) return;

    // Caller gets the real callId immediately, and learns which invitees
    // were actually reachable (offline ones get dropped from the roster).
    const onOutgoingAck = (payload: any) => {
      setCallId(payload.callId);

      const reachable = new Set<number>(payload.to ?? []);

      setParticipants((prev) => {
        const next = new Map();
        for (const [id, p] of prev) {
          if (reachable.has(id)) next.set(id, p);
        }
        return next;
      });
    };

    const onIncomingCall = (payload: any) => {
      if (statusRef.current !== "idle") {
        socket.emit(SOCKET_EVENTS.CALL_REJECTED, {
          callId: payload.callId,
          reason: "busy",
        });
        return;
      }

      setIncomingCall({
        callId: payload.callId,
        from: { id: payload.from, name: payload.callerName },
        isGroup: Boolean(payload.isGroup),
      });

      setStatus("ringing");
    };

    // Ack sent only to the user who just accepted — gives them the
    // roster of who else is already on the call (display only).
    const onCallAccepted = (payload: any) => {
      setStatus("connecting");
      setCallId(payload.callId);

      const others: Array<{ id: number; name?: string }> =
        payload.participants ?? [];

      if (others.length === 0) return;

      setParticipants((prev) => {
        const next = new Map(prev);
        for (const p of others) {
          if (!next.has(p.id)) {
            next.set(p.id, {
              user: { id: p.id, name: p.name },
              stream: null,
              connectionState: "new",
              status: "connecting",
            });
          }
        }
        return next;
      });
    };

    // Sent to everyone already on the call (except the person who sent the
    // invite, who already knows) whenever someone gets invited mid-call —
    // shows a "ringing" tile for the invitee right away instead of the
    // roster staying silent until they either join or the 60s ring times
    // out.
    const onInviteSent = (payload: any) => {
      const peerId = payload.userId;

      setIsGroupCall(true);

      setParticipants((prev) => {
        if (prev.has(peerId)) return prev;

        const next = new Map(prev);
        next.set(peerId, {
          user: { id: peerId, name: payload.name },
          stream: null,
          connectionState: "new",
          status: "ringing",
        });
        return next;
      });
    };

    // Sent to everyone already on the call whenever someone new joins.
    // Every existing participant creates an offer targeted at them —
    // the new joiner never initiates, avoiding offer/answer glare.
    const onParticipantJoined = async (payload: any) => {
      const peerId = payload.userId;

      setIsGroupCall(true);

      setParticipants((prev) => {
        if (prev.has(peerId)) {
          // We may already be tracking them as "ringing" from an earlier
          // CALL_INVITE_SENT broadcast — flip them to connecting now that
          // they've actually joined, but don't clobber a real entry.
          const existing = prev.get(peerId)!;
          if (existing.status === "connecting" || existing.status === "connected") {
            return prev;
          }
          const next = new Map(prev);
          next.set(peerId, { ...existing, status: "connecting" });
          return next;
        }

        const next = new Map(prev);
        next.set(peerId, {
          user: { id: peerId, name: payload.name },
          stream: null,
          connectionState: "new",
          status: "connecting",
        });
        return next;
      });

      try {
        const offer = await rtc.createOfferFor(peerId);

        socket.emit(SOCKET_EVENTS.SIGNAL_OFFER, {
          callId: payload.callId,
          to: peerId,
          offer,
        });
      } catch (err) {
        console.error("[CallContext] Failed to create/send offer", err);
        setError("Couldn't reach one of the participants.");
      }
    };

    const onParticipantLeft = (payload: any) => {
      rtc.removePeer(payload.userId);

      logCallOutcome(
        payload.userId,
        everConnectedIds.current.has(payload.userId) ? "completed" : "missed"
      );

      setParticipants((prev) => {
        if (!prev.has(payload.userId)) return prev;

        const next = new Map(prev);
        next.delete(payload.userId);
        return next;
      });
    };

    // Someone is out of the picture — declined, offline, timed out, or
    // disconnected before answering. `callEnded` tells us whether the
    // WHOLE call is over as a result, or just this one person.
    const onCallRejected = (payload: any) => {
      const rejecterId: number | undefined = payload?.from;
      const reason: string = payload?.reason ?? "declined";
      const callEnded: boolean = payload?.callEnded ?? true;

      const name = rejecterId
        ? participantsRef.current.get(rejecterId)?.user.name
        : undefined;
      const message = reasonMessage(reason, name ?? "They");

      if (rejecterId) {
        logCallOutcome(rejecterId, reason === "no_answer" || reason === "timeout" ? "missed" : "rejected");
      }

      if (!callEnded) {
        // Group call continues for everyone else. Rather than silently
        // dropping this one pending invite, show what happened to them
        // (declined / didn't pick up / unreachable) for a few seconds so
        // it's not indistinguishable from "still connecting", then remove
        // their tile.
        if (rejecterId) {
          rtc.removePeer(rejecterId);

          const outcomeStatus: ParticipantStatus =
            reason === "no_answer" || reason === "timeout"
              ? "no_answer"
              : reason === "offline"
              ? "offline"
              : "declined";

          setParticipants((prev) => {
            if (!prev.has(rejecterId)) return prev;
            const next = new Map(prev);
            next.set(rejecterId, { ...prev.get(rejecterId)!, status: outcomeStatus });
            return next;
          });

          const myGeneration = generationRef.current;
          setTimeout(() => {
            if (generationRef.current !== myGeneration) return;
            setParticipants((prev) => {
              if (!prev.has(rejecterId)) return prev;
              const next = new Map(prev);
              next.delete(rejecterId);
              return next;
            });
          }, 4000);
        }

        setError(message);
        setTimeout(() => {
          setError((current) => (current === message ? null : current));
        }, 5000);
        return;
      }

      // Whole call is over. For an immediate "offline" rejection (we know
      // instantly, before the person's phone would ever really have had a
      // chance to ring), wait a few seconds before revealing it — matches
      // the feel of an actual call attempt rather than an instant bounce.
      // "no_answer" already waited out a real 60s ring, "declined"/"busy"
      // are genuinely real-time — those reveal immediately.
      const revealDelay =
        reason === "offline" && everConnectedIds.current.size === 0
          ? 4000
          : 0;

      const myGeneration = generationRef.current;

      const reveal = () => {
        if (generationRef.current !== myGeneration) return;

        setError(message);
        setStatus("failed");

        setTimeout(() => {
          if (generationRef.current === myGeneration) {
            resetCallRef.current();
          }
        }, 3000);
      };

      if (revealDelay > 0) {
        setTimeout(reveal, revealDelay);
      } else {
        reveal();
      }
    };

    // Someone sent us an offer (either the original callee answering the
    // original caller, or an existing group member answering us as a new
    // joiner).
    const onOffer = async (payload: any) => {
      const peerId = payload.from;
      setCallId(payload.callId);

      setParticipants((prev) => {
        if (prev.has(peerId)) return prev;

        const next = new Map(prev);
        next.set(peerId, {
          user: { id: peerId },
          stream: null,
          connectionState: "new",
          status: "connecting",
        });
        return next;
      });

      try {
        const answer = await rtc.createAnswerFor(peerId, payload.offer);

        socket.emit(SOCKET_EVENTS.SIGNAL_ANSWER, {
          callId: payload.callId,
          to: peerId,
          answer,
        });
      } catch (err) {
        console.error("[CallContext] Failed to handle offer from", peerId, err);
        if (String(err).includes("NotAllowedError") || String(err).includes("Permission")) {
          setError("Microphone access is required to answer calls.");
        } else {
          setError("Couldn't connect the call.");
        }
      }
    };

    const onAnswer = async (payload: any) => {
      try {
        await rtc.setRemoteAnswerFor(payload.from, payload.answer);
      } catch (err) {
        console.error("[CallContext] Failed to apply answer from", payload.from, err);
      }
    };

    const onIce = async (payload: any) => {
      await rtc.addIceCandidate(payload.from, payload.candidate);
    };

    const onCallEnded = () => {
      resetCallRef.current();
    };

    socket.on(SOCKET_EVENTS.CALL_OUTGOING, onOutgoingAck);
    socket.on(SOCKET_EVENTS.CALL_INCOMING, onIncomingCall);
    socket.on(SOCKET_EVENTS.CALL_ACCEPTED, onCallAccepted);
    socket.on(SOCKET_EVENTS.CALL_INVITE_SENT, onInviteSent);
    socket.on(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, onParticipantJoined);
    socket.on(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, onParticipantLeft);
    socket.on(SOCKET_EVENTS.CALL_REJECTED, onCallRejected);
    socket.on(SOCKET_EVENTS.SIGNAL_OFFER, onOffer);
    socket.on(SOCKET_EVENTS.SIGNAL_ANSWER, onAnswer);
    socket.on(SOCKET_EVENTS.SIGNAL_ICE, onIce);
    socket.on(SOCKET_EVENTS.CALL_ENDED, onCallEnded);

    return () => {
      socket.off(SOCKET_EVENTS.CALL_OUTGOING, onOutgoingAck);
      socket.off(SOCKET_EVENTS.CALL_INCOMING, onIncomingCall);
      socket.off(SOCKET_EVENTS.CALL_ACCEPTED, onCallAccepted);
      socket.off(SOCKET_EVENTS.CALL_INVITE_SENT, onInviteSent);
      socket.off(SOCKET_EVENTS.CALL_PARTICIPANT_JOINED, onParticipantJoined);
      socket.off(SOCKET_EVENTS.CALL_PARTICIPANT_LEFT, onParticipantLeft);
      socket.off(SOCKET_EVENTS.CALL_REJECTED, onCallRejected);
      socket.off(SOCKET_EVENTS.SIGNAL_OFFER, onOffer);
      socket.off(SOCKET_EVENTS.SIGNAL_ANSWER, onAnswer);
      socket.off(SOCKET_EVENTS.SIGNAL_ICE, onIce);
      socket.off(SOCKET_EVENTS.CALL_ENDED, onCallEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, rtc, setCallId]);

  // ======================================================
  // Socket connection lifecycle — tied to auth, not call status.
  // ======================================================

  useEffect(() => {
    if (!user) {
      disconnectSocket();
      return;
    }

    connectSocket();

    return () => {
      disconnectSocket();
    };
  }, [user]);

  // ======================================================
  // Call duration timer
  // ======================================================

  useEffect(() => {
    if (status !== "connected") {
      setDuration(0);
      return;
    }

    const timer = setInterval(() => {
      setDuration((d) => d + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [status]);

  // ======================================================
  // Derived state
  // ======================================================

  const participantList = useMemo(() => [...participants.values()], [participants]);
  const isInCall = useMemo(() => status !== "idle", [status]);

  // Defensive: "connected" is derived from actual participant connection
  // state rather than trusted purely from the imperative setStatus call —
  // if any peer's RTCPeerConnection is genuinely connected, the UI should
  // reflect that regardless of any status-update timing/ordering quirk.
  const derivedStatus = useMemo<CallStatus>(() => {
    if (status === "idle" || status === "failed") return status;
    const anyConnected = participantList.some(
      (p) => p.connectionState === "connected"
    );
    return anyConnected ? "connected" : status;
  }, [status, participantList]);

  // ======================================================
  // Context value
  // ======================================================

  const value = useMemo<CallContextValue>(
    () => ({
      status: derivedStatus,
      isInCall,
      callId,
      isGroupCall,

      incomingCall,
      participants: participantList,

      localStream,

      detectionState,
      detectionConfidence,

      duration,
      isMuted: !isMicOn,
      isMicOn,

      error,
      clearError,

      startCall,
      acceptCall,
      rejectCall,
      endCall,

      toggleMute,
      toggleMic,
      inviteToCall,
    }),
    [
      derivedStatus,
      isInCall,
      callId,
      isGroupCall,
      incomingCall,
      participantList,
      localStream,
      detectionState,
      detectionConfidence,
      duration,
      isMicOn,
      error,
      clearError,
      startCall,
      acceptCall,
      rejectCall,
      endCall,
      toggleMute,
      toggleMic,
      inviteToCall,
    ]
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

// ======================================================
// Hook
// ======================================================

export function useCall() {
  const ctx = useContext(CallContext);

  if (!ctx) {
    throw new Error("useCall must be used within CallProvider");
  }

  return ctx;
}
