// ===========================================================================
// AudioChunker — turns the existing mic MediaStream into fixed-length raw
// PCM chunks, without touching anything WebRTC is doing with that same
// stream.
//
// This is capture-only. It does not send chunks anywhere, does not run any
// model, and does not know anything about deepfake detection — it just
// produces `AudioChunk` objects on a callback, the same way WebRTCManager
// produces streams/ICE candidates/state changes on callbacks. Whatever
// consumes those chunks (the AI integration layer, next milestone) is a
// separate concern that plugs into `onChunk` from the outside.
//
// Why this doesn't interfere with the call:
// `AudioContext.createMediaStreamSource(stream)` opens a READ-ONLY tap on an
// existing MediaStream — it does not consume, remove, or mute the
// underlying MediaStreamTrack. The exact same track is, at the same time,
// attached to one or more RTCPeerConnection senders by WebRTCManager. Two
// independent consumers of one stream; neither affects the other. This
// class is also never connected to `audioContext.destination`, so it never
// causes the mic to play back through the user's own speakers.
//
// Architecture:
//   MediaStream (from WebRTCManager)
//     -> MediaStreamAudioSourceNode   (Web Audio API tap, this file)
//     -> AudioWorkletNode             (runs pcm-capture-processor.js)
//     -> port.onmessage batches       (this file, main thread)
//     -> accumulated into exact 4s chunks -> onChunk callback
// ===========================================================================

/** Target chunk length. 4 seconds, per the AI integration requirement. */
export const CHUNK_DURATION_SECONDS = 4;

/**
 * Batch size the worklet processor flushes at, in samples. Kept in sync
 * with BATCH_SIZE_SAMPLES in pcm-capture-processor.js by convention — see
 * that file for why it can't be shared via import.
 */
const BATCH_SIZE_SAMPLES = 4096;

/**
 * One fixed-length block of raw microphone audio, ready to be handed to an
 * AI model. Deliberately NOT resampled or re-encoded here — the model's
 * exact expected input format (sample rate, encoding) isn't decided yet,
 * so `sampleRate` is carried alongside the raw samples for whatever
 * consumes this next to make that decision explicitly, instead of this
 * capture layer silently guessing.
 */
export interface AudioChunk {
  /** Mono PCM samples, one float per sample, range roughly -1..1. */
  samples: Float32Array;
  /** Sample rate the AudioContext actually captured at (browser/device
   *  dependent — typically 48000, sometimes 44100). */
  sampleRate: number;
  /** Chunk length in milliseconds. Effectively always ~4000; only present
   *  as a field (rather than assumed) so a future short final chunk
   *  wouldn't silently be misread as a full one. */
  durationMs: number;
  /** Wall-clock time (ms since epoch) this chunk finished capturing. Lets
   *  a future consumer correlate a chunk with call timeline/UI state. */
  timestamp: number;
}

export interface AudioChunkerCallbacks {
  /** Called once per completed 4-second chunk. */
  onChunk?: (chunk: AudioChunk) => void;
  /**
   * Called on any capture-setup or capture-runtime failure (e.g. browser
   * without AudioWorklet support, worklet module failing to load). Capture
   * is a secondary feature riding along an active call — a failure here
   * must never throw into, or interrupt, the call itself. Callers should
   * treat this as "detection capture unavailable this call", not a fatal
   * error.
   */
  onError?: (error: unknown) => void;
}

/** Shape of the messages posted by pcm-capture-processor.js. */
interface WorkletBatchMessage {
  type: "batch";
  samples: Float32Array;
  sampleRate: number;
}

export class AudioChunker {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;

  /** Batches received from the worklet since the last emitted chunk,
   *  awaiting enough samples to complete the next 4-second chunk. */
  private pendingBatches: Float32Array[] = [];
  private pendingSampleCount = 0;

  private running = false;

  constructor(private callbacks: AudioChunkerCallbacks = {}) {}

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  /**
   * Starts tapping `stream` for chunk capture. Safe to call once per call;
   * a second call while already running is a no-op (mirrors
   * WebRTCManager.initializeLocalStream's "already have one" guard).
   *
   * Deliberately does NOT call getUserMedia() — it only ever reads a stream
   * that WebRTCManager already obtained, so there is exactly one owner of
   * the microphone for the whole app.
   */
  async start(stream: MediaStream): Promise<void> {
    if (this.running) return;

    try {
      if (typeof AudioContext === "undefined" || !("audioWorklet" in AudioContext.prototype)) {
        throw new Error("AudioWorklet is not supported in this browser");
      }

      this.audioContext = new AudioContext();

      // Some browsers create AudioContexts in a "suspended" state until a
      // user gesture is observed. The call itself already required a user
      // gesture (accepting/starting it) and a live getUserMedia() stream by
      // the time this runs, so resuming here is just a defensive no-op in
      // most cases, not a workaround for a real gesture problem.
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      // Loaded via new URL(...) so Vite fingerprints/bundles this as a
      // static asset correctly in both dev and production builds, rather
      // than assuming a fixed public/ path.
      await this.audioContext.audioWorklet.addModule(
        new URL("./pcm-capture-processor.js", import.meta.url)
      );

      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.workletNode = new AudioWorkletNode(this.audioContext, "pcm-capture-processor");

      this.workletNode.port.onmessage = (event: MessageEvent<WorkletBatchMessage>) => {
        this.handleBatch(event.data);
      };

      // Tap the stream, but deliberately do NOT connect workletNode onward
      // to audioContext.destination — this path exists purely to read
      // samples, not to play the mic back out of the user's speakers.
      this.sourceNode.connect(this.workletNode);

      this.running = true;
    } catch (error) {
      this.callbacks.onError?.(error);
      // Clean up any partially-created nodes so a failed start doesn't
      // leave a half-open AudioContext behind.
      this.teardown();
    }
  }

  /** Tears down capture. Safe to call even if start() was never called or
   *  already failed — mirrors WebRTCManager.cleanup()'s "safe at any time"
   *  contract. */
  stop(): void {
    this.teardown();
  }

  isRunning(): boolean {
    return this.running;
  }

  // ===========================================================================
  // Batch -> chunk assembly
  // ===========================================================================

  private handleBatch(message: WorkletBatchMessage): void {
    if (!message || message.type !== "batch") return;

    this.pendingBatches.push(message.samples);
    this.pendingSampleCount += message.samples.length;

    const targetSampleCount = Math.round(CHUNK_DURATION_SECONDS * message.sampleRate);

    // A single worklet batch (BATCH_SIZE_SAMPLES) is always far smaller
    // than a 4-second chunk, so this fires once pendingSampleCount crosses
    // the threshold — never skips past it.
    if (this.pendingSampleCount >= targetSampleCount) {
      this.emitChunk(targetSampleCount, message.sampleRate);
    }
  }

  private emitChunk(targetSampleCount: number, sampleRate: number): void {
    // Concatenate everything accumulated so far into one contiguous buffer,
    // since the pending batches arrived as separate small Float32Arrays.
    const combined = new Float32Array(this.pendingSampleCount);
    let offset = 0;
    for (const batch of this.pendingBatches) {
      combined.set(batch, offset);
      offset += batch.length;
    }

    // Slice out exactly one chunk's worth of samples. Any samples beyond
    // that belong to the NEXT chunk, not this one — carrying them forward
    // (rather than discarding them) means chunk boundaries never drop
    // audio, which matters for a model that may care about continuity
    // across chunks later.
    const chunkSamples = combined.slice(0, targetSampleCount);
    const remainder = combined.slice(targetSampleCount);

    this.pendingBatches = remainder.length > 0 ? [remainder] : [];
    this.pendingSampleCount = remainder.length;

    this.callbacks.onChunk?.({
      samples: chunkSamples,
      sampleRate,
      durationMs: Math.round((chunkSamples.length / sampleRate) * 1000),
      timestamp: Date.now(),
    });
  }

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  private teardown(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      // close() is async but errors here (e.g. already-closed context)
      // aren't actionable — this is teardown, nothing awaits it.
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    // Deliberately drop any partial, not-yet-4-seconds chunk rather than
    // flushing it as a short final chunk — a fixed-length model input is
    // simpler to reason about downstream than "usually 4s, sometimes
    // shorter." Revisit if the AI integration milestone wants a partial
    // trailing chunk instead of losing that last sliver of audio.
    this.pendingBatches = [];
    this.pendingSampleCount = 0;

    this.running = false;
  }
}
