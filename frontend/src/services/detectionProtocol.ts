// ===========================================================================
// detectionProtocol.ts — wire format for sending AudioChunks to the Python
// detection service.
//
// This file has exactly one job: turn an AudioChunk (produced by
// AudioChunker, see lib/audio/AudioChunker.ts) into the bytes that go over
// the wire, and nothing else. It knows nothing about WebSockets, connection
// state, or reconnection — that's detectionTransport.ts's job. Keeping wire
// format separate from connection management means either can change
// without touching the other, and this file can be unit-tested with plain
// ArrayBuffers, no socket required.
//
// Wire format (one WebSocket binary frame per chunk):
//
//   [ 4 bytes  ] header length, little-endian uint32
//   [ N bytes  ] header, UTF-8 JSON  (see ChunkHeader below)
//   [ M bytes  ] raw PCM samples, 32-bit float, little-endian, mono
//
// Why a length-prefixed JSON header instead of two separate WS messages
// (one JSON, one binary)? A single frame can't be torn apart by message
// reordering or partial delivery, and the Python side only needs one
// `struct.unpack` + `json.loads` + `numpy.frombuffer` to fully decode a
// chunk — no need to correlate two independent messages by sequence number.
//
// Why JSON for the header instead of a fully fixed binary struct? The
// header is tiny and infrequent (once per 4-second chunk, not per sample),
// so JSON's overhead is irrelevant, and it stays trivially easy to add a
// field later (e.g. a device id) without every consumer needing to agree
// on a new fixed byte layout up front.
// ===========================================================================

import type { AudioChunk } from "@/lib/audio/AudioChunker";

/**
 * Metadata describing one PCM chunk, sent as the JSON portion of the wire
 * frame. `encoding` is included explicitly (rather than assumed) so the
 * receiving side never has to guess the sample format — if this ever needs
 * to change (e.g. int16 PCM to cut bandwidth), old and new clients stay
 * distinguishable from the header alone.
 */
export interface ChunkHeader {
  /** Monotonically increasing per-connection sequence number, starting at
   *  0 on each new connection. Lets the server detect gaps (e.g. chunks
   *  dropped while reconnecting) without relying on timestamps alone. */
  sequence: number;
  /** Sample rate the chunk was captured at (see AudioChunker — capture is
   *  not resampled, so this varies by device/browser). */
  sampleRate: number;
  /** Number of samples in the PCM payload — redundant with the payload's
   *  byte length (sampleCount * 4), but keeping it explicit means the
   *  server can validate the frame before trusting the byte math. */
  sampleCount: number;
  /** Chunk length in milliseconds, carried through from AudioChunk as-is. */
  durationMs: number;
  /** Wall-clock capture time (ms since epoch), carried through from
   *  AudioChunk as-is. */
  timestamp: number;
  /** Wire format of the PCM payload that follows the header. Only one
   *  value exists today; the field exists so a future format change is a
   *  version bump the server can branch on, not a silent break. */
  encoding: "float32le";
}

/**
 * Encodes one AudioChunk into a single ArrayBuffer ready to hand to
 * `WebSocket.send()`. Pure and synchronous — no I/O, no connection state,
 * safe to call regardless of whether a socket is currently open.
 */
export function encodeChunkMessage(chunk: AudioChunk, sequence: number): ArrayBuffer {
  const header: ChunkHeader = {
    sequence,
    sampleRate: chunk.sampleRate,
    sampleCount: chunk.samples.length,
    durationMs: chunk.durationMs,
    timestamp: chunk.timestamp,
    encoding: "float32le",
  };

  const headerBytes = new TextEncoder().encode(JSON.stringify(header));

  // A view over the chunk's existing sample buffer, not a copy — the copy
  // happens exactly once below, when everything is assembled into the
  // final frame.
  const pcmBytes = new Uint8Array(
    chunk.samples.buffer,
    chunk.samples.byteOffset,
    chunk.samples.byteLength
  );

  const frame = new ArrayBuffer(4 + headerBytes.byteLength + pcmBytes.byteLength);
  const view = new DataView(frame);

  // true = little-endian, matched by the "float32le" / struct.unpack("<I", ...)
  // contract documented above — must agree with whatever the Python side
  // eventually assumes.
  view.setUint32(0, headerBytes.byteLength, true);

  const bytes = new Uint8Array(frame);
  bytes.set(headerBytes, 4);
  bytes.set(pcmBytes, 4 + headerBytes.byteLength);

  return frame;
}

/**
 * Rough size estimate in bytes for one 4-second, 48kHz mono float32 chunk,
 * used only to size the transport's in-memory queue sensibly (see
 * `maxQueuedChunks` in detectionTransport.ts). Not used for encoding.
 */
export const APPROX_BYTES_PER_CHUNK = 4 * 48_000 * 4; // duration * sampleRate * bytesPerFloat32

// ===========================================================================
// Server -> client: verdict messages
//
// The detection service sends one JSON text frame per chunk it processes,
// shaped like `{ type: "verdict", prediction, confidence_score,
// processing_time_ms }`. This is produced by the real Stage 1 model in
// ai-service/app/predictor.py (LFCC-LCNN, loaded from the trained
// checkpoint at startup) — this shape has been stable since before that
// model replaced the earlier dummy predictor, so nothing here needed to
// change.
// ===========================================================================

/** Raw verdict payload as received from the detection service. */
export interface DetectionVerdictMessage {
  type: "verdict";
  /** Free-form label from the detection service. See
   *  constants/detection.ts's mapPredictionToDetectionState for how this
   *  turns into a DetectionState the UI renders. */
  prediction: string;
  /** 0-100 confidence score for `prediction`. */
  confidence_score: number;
  /** How long the service took to produce this verdict, in milliseconds
   *  (currently near-instant, since no real model runs yet). */
  processing_time_ms: number;
}

/**
 * Narrows an unknown value (as forwarded by DetectionTransport's
 * onServerMessage, which deliberately doesn't interpret messages itself)
 * into a DetectionVerdictMessage. Returns false for anything malformed
 * rather than throwing — a bad message from the detection service should
 * be ignored, not crash the call.
 */
export function isDetectionVerdictMessage(data: unknown): data is DetectionVerdictMessage {
  if (typeof data !== "object" || data === null) return false;

  const candidate = data as Record<string, unknown>;

  return (
    candidate.type === "verdict" &&
    typeof candidate.prediction === "string" &&
    typeof candidate.confidence_score === "number" &&
    typeof candidate.processing_time_ms === "number"
  );
}
