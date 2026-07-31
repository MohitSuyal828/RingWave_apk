// ===========================================================================
// WebRTCManager — multi-peer (mesh) manager.
//
// Handles both 1:1 calls and small group calls the same way: a 1:1 call is
// just a mesh with one remote peer. Each remote participant gets their own
// RTCPeerConnection, keyed by their user id, sharing one local media stream.
//
// ICE servers are read from VITE_ICE_SERVERS (JSON array) when provided, so
// a TURN server can be added via env config without a code change — plain
// STUN alone will not traverse every NAT (symmetric NAT / strict corporate
// networks), which is a common cause of "it rings but audio never connects".
// ===========================================================================

import { getSettings } from "./settings";

export type PeerConnectionState = RTCPeerConnectionState;

export interface WebRTCManagerCallbacks {
  onLocalStream?: (stream: MediaStream) => void;
  onRemoteStream?: (peerId: number, stream: MediaStream) => void;
  onIceCandidate?: (peerId: number, candidate: RTCIceCandidateInit) => void;
  onConnectionStateChange?: (
    peerId: number,
    state: PeerConnectionState
  ) => void;
}

interface PeerEntry {
  connection: RTCPeerConnection;
  remoteStream: MediaStream;
  pendingIceCandidates: RTCIceCandidateInit[];
}

const getIceServers = (): RTCIceServer[] => {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    } catch {
      console.warn("[WebRTCManager] Could not parse VITE_ICE_SERVERS, falling back to STUN only");
    }
  }

  return [{ urls: "stun:stun.l.google.com:19302" }];
};

export class WebRTCManager {
  private peers = new Map<number, PeerEntry>();

  private localStream: MediaStream | null = null;

  /** Source of truth for mute state — tracked independently of whatever
   *  MediaStreamTrack objects currently exist, so it can be reapplied any
   *  time a track is (re)attached to a (new) peer connection, instead of
   *  relying purely on every sender happening to already share the exact
   *  same track reference. */
  private micEnabled = true;

  constructor(private callbacks: WebRTCManagerCallbacks = {}) {}

  // ===========================================================================
  // Local Media
  // ===========================================================================

  async initializeLocalStream(
    options?: MediaStreamConstraints
  ): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    const settings = getSettings();

    const constraints: MediaStreamConstraints = options ?? {
      audio: {
        noiseSuppression: settings.noiseCancellation,
        echoCancellation: settings.echoReduction,
      },
      video: false,
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    // If mute was toggled before the mic stream existed yet (e.g. the very
    // first offer/answer of the call hasn't happened), make sure the fresh
    // tracks come up honoring that instead of always starting live.
    for (const track of this.localStream.getAudioTracks()) {
      track.enabled = this.micEnabled;
    }

    this.callbacks.onLocalStream?.(this.localStream);

    return this.localStream;
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream(peerId: number) {
    return this.peers.get(peerId)?.remoteStream ?? null;
  }

  getPeerIds(): number[] {
    return [...this.peers.keys()];
  }

  // ===========================================================================
  // Peer connections (one per remote participant)
  // ===========================================================================

  private getOrCreatePeer(peerId: number): PeerEntry {
    const existing = this.peers.get(peerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({
      iceServers: getIceServers(),
    });

    const entry: PeerEntry = {
      connection,
      remoteStream: new MediaStream(),
      pendingIceCandidates: [],
    };

    connection.ontrack = (event) => {
      event.streams[0].getTracks().forEach((track) => {
        if (!entry.remoteStream.getTracks().some((t) => t.id === track.id)) {
          entry.remoteStream.addTrack(track);
        }
      });

      this.callbacks.onRemoteStream?.(peerId, entry.remoteStream);
    };

    connection.onicecandidate = (event) => {
      if (!event.candidate) return;

      this.callbacks.onIceCandidate?.(peerId, event.candidate.toJSON());
    };

    connection.onconnectionstatechange = () => {
      this.callbacks.onConnectionStateChange?.(
        peerId,
        connection.connectionState
      );
    };

    this.peers.set(peerId, entry);

    return entry;
  }

  private attachLocalTracks(connection: RTCPeerConnection) {
    if (!this.localStream) return;

    const senders = connection.getSenders();

    for (const track of this.localStream.getTracks()) {
      if (track.kind === "audio") {
        track.enabled = this.micEnabled;
      }

      const sender = senders.find((s) => s.track?.kind === track.kind);

      if (sender) {
        sender.replaceTrack(track);
      } else {
        connection.addTrack(track, this.localStream);
      }
    }
  }

  // ===========================================================================
  // Offer / Answer
  // ===========================================================================

  async createOfferFor(peerId: number): Promise<RTCSessionDescriptionInit> {
    const { connection } = this.getOrCreatePeer(peerId);

    await this.initializeLocalStream();
    this.attachLocalTracks(connection);

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    return connection.localDescription!;
  }

  async createAnswerFor(
    peerId: number,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const { connection } = this.getOrCreatePeer(peerId);

    await connection.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushPendingIceCandidates(peerId);

    await this.initializeLocalStream();
    this.attachLocalTracks(connection);

    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);

    return connection.localDescription!;
  }

  async setRemoteAnswerFor(peerId: number, answer: RTCSessionDescriptionInit) {
    const { connection } = this.getOrCreatePeer(peerId);

    await connection.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushPendingIceCandidates(peerId);
  }

  // ===========================================================================
  // ICE
  // ===========================================================================

  async addIceCandidate(peerId: number, candidate: RTCIceCandidateInit) {
    const entry = this.peers.get(peerId);
    if (!entry) return;

    if (!entry.connection.remoteDescription) {
      entry.pendingIceCandidates.push(candidate);
      return;
    }

    await entry.connection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async flushPendingIceCandidates(peerId: number) {
    const entry = this.peers.get(peerId);
    if (!entry) return;

    for (const candidate of entry.pendingIceCandidates) {
      await entry.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }

    entry.pendingIceCandidates = [];
  }

  // ===========================================================================
  // Media Controls (apply to every peer connection at once)
  // ===========================================================================

  setMicrophoneEnabled(enabled: boolean) {
    this.micEnabled = enabled;

    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });

    // Belt-and-suspenders: explicitly touch every peer connection's own
    // sender too, in case any of them ever ends up with a track that isn't
    // literally the same object reference as localStream's (a fresh
    // getUserMedia() call, a device switch, etc.) — without this, muting
    // could silently apply to some peers in a group call and not others.
    for (const { connection } of this.peers.values()) {
      for (const sender of connection.getSenders()) {
        if (sender.track?.kind === "audio") {
          sender.track.enabled = enabled;
        }
      }
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  getConnectionState(peerId: number): PeerConnectionState | "closed" {
    return this.peers.get(peerId)?.connection.connectionState ?? "closed";
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  /** Tears down one peer (a single participant left the call). */
  removePeer(peerId: number) {
    const entry = this.peers.get(peerId);
    if (!entry) return;

    entry.remoteStream.getTracks().forEach((t) => t.stop());

    entry.connection.ontrack = null;
    entry.connection.onicecandidate = null;
    entry.connection.onconnectionstatechange = null;
    entry.connection.close();

    this.peers.delete(peerId);
  }

  /** Tears down everything (the call ended). */
  cleanup() {
    for (const peerId of this.getPeerIds()) {
      this.removePeer(peerId);
    }

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.micEnabled = true;
  }
}
