// ===========================================================================
// detectionTransport.ts — sends AudioChunks to the Python deepfake-detection
// service over a dedicated WebSocket.
//
// Scope: transport only. This file does not run any model and does not
// know what a "verdict" looks like — that lives in ai-service/app/. What
// it does implement:
//   - opening/closing a WebSocket to the detection service
//   - the auth handshake (send a token, wait for an ack)
//   - reconnection with backoff if the connection drops mid-call
//   - encoding + sending AudioChunks (via detectionProtocol.ts)
//   - a bounded in-memory queue so chunks captured while briefly
//     disconnected aren't just thrown away
//
// This is intentionally independent of AudioChunker and WebRTCManager: it
// has no reference to either, and only ever receives already-produced
// AudioChunk objects through sendChunk(). CallContext.tsx is what wires
// AudioChunker's onChunk output into this class's sendChunk input — this
// file could be unit-tested or swapped out without touching either of
// those two files.
//
// Auth handshake: send `{ type: "auth", token }` right after the socket
// opens, and wait for a `{ type: "auth_ack" }` (or `{ type: "auth_error" }`)
// response before treating the connection as usable. This matches
// ai-service/app/routes/detection_ws.py's _authenticate() exactly — see
// handleOpen/handleMessage below for the client side of the same contract.
// ===========================================================================

import { useAuthStore } from "@/store/authStore";
import type { AudioChunk } from "@/lib/audio/AudioChunker";
import { encodeChunkMessage } from "@/services/detectionProtocol";

// ===========================================================================
// Public types
// ===========================================================================

export type DetectionConnectionState =
  | "idle" // never connected, or disconnect() was called
  | "connecting" // socket opening, pre-handshake
  | "authenticating" // socket open, auth message sent, awaiting ack
  | "open" // authenticated and ready to send chunks
  | "reconnecting" // a previous connection dropped; backoff in progress
  | "failed"; // gave up after maxRetryAttempts — non-fatal to the call

export interface DetectionTransportCallbacks {
  /** Fires on every connection-state transition — useful for a future UI
   *  indicator ("Detection connecting…") and for debugging. */
  onStateChange?: (state: DetectionConnectionState) => void;
  /** Fires for any transport-level problem (socket error, auth failure,
   *  giving up after max retries). Never thrown — this is a side channel,
   *  not something that should ever interrupt the call. */
  onError?: (error: unknown) => void;
  /**
   * Fires for any non-auth JSON message received from the server. The
   * inference milestone will define what these messages mean (detection
   * verdicts, etc.) and subscribe here — this file only forwards them
   * unparsed/untyped, since interpreting them isn't a transport concern.
   */
  onServerMessage?: (data: unknown) => void;
}

export interface DetectionTransportOptions {
  /** WebSocket URL of the detection service. Defaults to
   *  VITE_DETECTION_WS_URL. If neither is set, the transport stays in
   *  "idle" and never attempts to connect — a missing endpoint is a
   *  configuration gap, not something worth retrying against forever. */
  url?: string;
  /**
   * Returns the current auth token to send during the handshake. Defaults
   * to the same access token already used for the app's Socket.IO
   * connection (see services/socket.ts's getSocket()), so this doesn't
   * invent a second notion of "how the client is authenticated" — it's a
   * placeholder for whatever the real Python service ends up expecting.
   */
  getAuthToken?: () => string | null;
  /** Max chunks held in memory while not connected/authenticated yet.
   *  Oldest chunk is dropped once full. Default 3 (~12 seconds of audio) —
   *  detection audio that old is no longer worth analyzing by the time it
   *  would go out, so unbounded queueing would only hide a real problem. */
  maxQueuedChunks?: number;
  /** Reconnect backoff floor, ms. Default 1000. */
  minRetryDelayMs?: number;
  /** Reconnect backoff ceiling, ms. Default 30000. */
  maxRetryDelayMs?: number;
  /** Consecutive reconnect attempts allowed before giving up for this call
   *  (state -> "failed"). Default 8 — generous enough to survive a short
   *  network blip, bounded so a genuinely dead service doesn't retry
   *  forever in the background. */
  maxRetryAttempts?: number;
  /** How long to wait for an auth_ack after the socket opens before
   *  treating the handshake as failed and reconnecting. Default 5000. */
  authTimeoutMs?: number;
}

const DEFAULTS = {
  maxQueuedChunks: 3,
  minRetryDelayMs: 1000,
  maxRetryDelayMs: 30_000,
  maxRetryAttempts: 8,
  authTimeoutMs: 5000,
} as const;

// ===========================================================================
// Transport
// ===========================================================================

export class DetectionTransport {
  private socket: WebSocket | null = null;
  private state: DetectionConnectionState = "idle";

  private readonly url: string | undefined;
  private readonly getAuthToken: () => string | null;
  private readonly maxQueuedChunks: number;
  private readonly minRetryDelayMs: number;
  private readonly maxRetryDelayMs: number;
  private readonly maxRetryAttempts: number;
  private readonly authTimeoutMs: number;

  /** Chunks already encoded to wire format, waiting for the socket to be
   *  "open". Encoding eagerly (rather than queueing raw AudioChunks) means
   *  the queue never holds a reference to the original Float32Array/its
   *  backing buffer any longer than necessary. */
  private queue: ArrayBuffer[] = [];

  /** Per-connection sequence number, reset to 0 every time a fresh socket
   *  is opened (see detectionProtocol.ChunkHeader.sequence). */
  private sequence = 0;

  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private authTimer: ReturnType<typeof setTimeout> | null = null;

  /** Set by disconnect() so a socket close triggered by us is never
   *  mistaken for an unexpected drop that should trigger reconnection. */
  private intentionalClose = false;

  constructor(private callbacks: DetectionTransportCallbacks = {}, options: DetectionTransportOptions = {}) {
    this.url = options.url ?? (import.meta.env.VITE_DETECTION_WS_URL as string | undefined);
    this.getAuthToken = options.getAuthToken ?? (() => useAuthStore.getState().accessToken);
    this.maxQueuedChunks = options.maxQueuedChunks ?? DEFAULTS.maxQueuedChunks;
    this.minRetryDelayMs = options.minRetryDelayMs ?? DEFAULTS.minRetryDelayMs;
    this.maxRetryDelayMs = options.maxRetryDelayMs ?? DEFAULTS.maxRetryDelayMs;
    this.maxRetryAttempts = options.maxRetryAttempts ?? DEFAULTS.maxRetryAttempts;
    this.authTimeoutMs = options.authTimeoutMs ?? DEFAULTS.authTimeoutMs;
  }

  // ===========================================================================
  // Public lifecycle — mirrors AudioChunker's start()/stop() shape so
  // CallContext can drive both the same way.
  // ===========================================================================

  /** Opens the connection. Safe to call multiple times — a no-op if
   *  already connecting/open/reconnecting. */
  connect(): void {
    if (this.state !== "idle" && this.state !== "failed") return;

    if (!this.url) {
      // No endpoint configured — nothing to connect to. Surfaced once via
      // onError rather than silently doing nothing, so a missing env var
      // is discoverable in development without being fatal in production
      // (detection is a secondary feature; calls must work without it).
      this.callbacks.onError?.(
        new Error("VITE_DETECTION_WS_URL is not configured — detection transport disabled")
      );
      return;
    }

    this.intentionalClose = false;
    this.retryAttempt = 0;
    this.openSocket();
  }

  /** Closes the connection and discards any queued chunks. Safe to call
   *  even if never connected, or already closed — mirrors
   *  AudioChunker.stop()'s "safe at any time" contract. */
  disconnect(): void {
    this.intentionalClose = true;

    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.clearAuthTimer();

    if (this.socket) {
      // Detach handlers before closing so the close handler doesn't treat
      // this intentional teardown as a drop needing reconnection — belt
      // and suspenders alongside the intentionalClose flag above.
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;
      this.socket.close();
      this.socket = null;
    }

    this.queue = [];
    this.sequence = 0;
    this.setState("idle");
  }

  /**
   * Encodes and sends one chunk. If the connection isn't open yet, the
   * encoded chunk is queued (bounded — oldest dropped once full) and
   * flushed automatically once the connection becomes ready. Never
   * throws — a failure to send detection audio must never surface as a
   * call-affecting error.
   */
  sendChunk(chunk: AudioChunk): void {
    let encoded: ArrayBuffer;

    try {
      encoded = encodeChunkMessage(chunk, this.sequence++);
    } catch (error) {
      this.callbacks.onError?.(error);
      return;
    }

    if (this.state === "open" && this.socket?.readyState === WebSocket.OPEN) {
      this.send(encoded);
      return;
    }

    this.enqueue(encoded);
  }

  getState(): DetectionConnectionState {
    return this.state;
  }

  // ===========================================================================
  // Socket lifecycle (internal)
  // ===========================================================================

  private openSocket(): void {
    this.setState(this.retryAttempt > 0 ? "reconnecting" : "connecting");

    try {
      const socket = new WebSocket(this.url!);
      socket.binaryType = "arraybuffer";

      socket.onopen = () => this.handleOpen();
      socket.onmessage = (event) => this.handleMessage(event);
      socket.onerror = (event) => this.callbacks.onError?.(event);
      socket.onclose = () => this.handleClose();

      this.socket = socket;
    } catch (error) {
      this.callbacks.onError?.(error);
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    this.setState("authenticating");

    // ─── Auth placeholder ─────────────────────────────────────────────
    // See file header: this is the seam that changes once the real
    // Python service defines its actual handshake.
    const token = this.getAuthToken();
    this.send(JSON.stringify({ type: "auth", token }));

    this.clearAuthTimer();
    this.authTimer = setTimeout(() => {
      this.callbacks.onError?.(new Error("Detection service did not acknowledge auth in time"));
      // No ack in time is treated the same as a dropped connection —
      // close and let the normal reconnect path take over, rather than
      // duplicating retry logic here.
      this.socket?.close();
    }, this.authTimeoutMs);
  }

  private handleMessage(event: MessageEvent): void {
    if (typeof event.data !== "string") {
      // No binary server->client protocol is defined yet at this
      // milestone — forward it unparsed rather than silently dropping it,
      // so the inference milestone can decide what it means.
      this.callbacks.onServerMessage?.(event.data);
      return;
    }

    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      this.callbacks.onError?.(new Error("Received malformed message from detection service"));
      return;
    }

    if (message?.type === "auth_ack") {
      this.clearAuthTimer();
      this.retryAttempt = 0;
      this.setState("open");
      this.flushQueue();
      return;
    }

    if (message?.type === "auth_error") {
      this.clearAuthTimer();
      this.callbacks.onError?.(new Error(message.reason ?? "Detection service rejected authentication"));
      this.socket?.close();
      return;
    }

    // Anything else (e.g. a future detection verdict) is not this file's
    // concern to interpret — hand it off as-is.
    this.callbacks.onServerMessage?.(message);
  }

  private handleClose(): void {
    this.clearAuthTimer();
    this.socket = null;

    if (this.intentionalClose) {
      this.setState("idle");
      return;
    }

    this.scheduleReconnect();
  }

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  private scheduleReconnect(): void {
    if (this.retryAttempt >= this.maxRetryAttempts) {
      this.setState("failed");
      this.callbacks.onError?.(
        new Error(`Detection transport giving up after ${this.maxRetryAttempts} reconnect attempts`)
      );
      return;
    }

    this.setState("reconnecting");

    // Exponential backoff with jitter, capped at maxRetryDelayMs — avoids
    // every reconnect attempt landing in lockstep if multiple calls/tabs
    // are reconnecting to the same service at once.
    const exponential = this.minRetryDelayMs * 2 ** this.retryAttempt;
    const capped = Math.min(exponential, this.maxRetryDelayMs);
    const jitter = capped * (0.85 + Math.random() * 0.3);

    this.retryAttempt += 1;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.openSocket();
    }, jitter);
  }

  // ===========================================================================
  // Queue
  // ===========================================================================

  private enqueue(encoded: ArrayBuffer): void {
    this.queue.push(encoded);

    while (this.queue.length > this.maxQueuedChunks) {
      // Drop oldest first — the newest chunk is the most relevant one to
      // eventually analyze once the connection recovers.
      this.queue.shift();
    }
  }

  private flushQueue(): void {
    const pending = this.queue;
    this.queue = [];

    for (const encoded of pending) {
      this.send(encoded);
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private send(data: string | ArrayBuffer): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    try {
      this.socket.send(data);
    } catch (error) {
      this.callbacks.onError?.(error);
    }
  }

  private clearAuthTimer(): void {
    if (this.authTimer) {
      clearTimeout(this.authTimer);
      this.authTimer = null;
    }
  }

  private setState(next: DetectionConnectionState): void {
    if (this.state === next) return;
    this.state = next;
    this.callbacks.onStateChange?.(next);
  }
}
