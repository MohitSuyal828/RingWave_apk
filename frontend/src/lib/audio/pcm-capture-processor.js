// ===========================================================================
// pcm-capture-processor.js — AudioWorkletProcessor for raw mic capture.
//
// This is the AI-detection audio pipeline's only piece of code that runs on
// the browser's dedicated audio rendering thread instead of the main thread.
// The Web Audio spec hands processors 128 samples per channel at a time
// (a "render quantum", ~2.7ms at 48kHz) — far too fine-grained to be useful
// on its own and far too frequent to post to the main thread one frame at a
// time (that would be hundreds of postMessage calls per second for no
// benefit). So this processor's only job is: collect frames into a modest
// batch (BATCH_SIZE_SAMPLES), then hand the batch off in one message.
//
// The actual 4-second chunk assembly does NOT happen here — it happens in
// AudioChunker.ts on the main thread, where normal JS and app state are
// available. This file stays intentionally dumb: batch and forward, nothing
// else. That split keeps the one piece of code with hard real-time
// constraints (this file) as small and low-risk as possible.
//
// Load-bearing constraint: this file is loaded via
// `audioContext.audioWorklet.addModule(...)` as a standalone script. It runs
// in AudioWorkletGlobalScope, a separate, minimal JS environment that predates
// ES module bundling — it CANNOT import from the app's TypeScript/bundle
// graph, use TypeScript syntax, or reach anything outside this file. Anything
// it needs (like BATCH_SIZE_SAMPLES) has to be duplicated here rather than
// imported.
// ===========================================================================

// Kept in sync with BATCH_SIZE_SAMPLES in AudioChunker.ts by convention, not
// by import (see note above on why this file can't import anything). If you
// change one, change the other.
const BATCH_SIZE_SAMPLES = 4096;

class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Rolling buffer for the batch currently being filled. One 128-sample
    // render quantum is copied in at a time until this reaches
    // BATCH_SIZE_SAMPLES, at which point it's flushed to the main thread and
    // a fresh buffer takes its place.
    this._buffer = new Float32Array(BATCH_SIZE_SAMPLES);
    this._writeIndex = 0;
  }

  // Invoked automatically by the audio engine roughly every render quantum.
  // Returning `true` keeps this processor alive for the rest of the call;
  // returning `false` (or throwing) would silently and permanently stop mic
  // capture, so every branch here is deliberately defensive rather than
  // asserting/throwing on unexpected input shapes.
  process(inputs) {
    const input = inputs[0];

    // No connected input for this render quantum yet — nothing to capture,
    // but stay alive and try again next quantum.
    if (!input || input.length === 0) {
      return true;
    }

    // Mono capture only: the mic is requested upstream as a plain audio
    // stream (see WebRTCManager.initializeLocalStream), so channel 0 is the
    // only channel a voice-detection model needs. If a stereo/multi-channel
    // input ever reaches this processor, every channel past the first is
    // deliberately ignored rather than downmixed — keeps this file simple,
    // and stereo carries no extra information for a single speaker's voice.
    const channelData = input[0];
    if (!channelData) {
      return true;
    }

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex === BATCH_SIZE_SAMPLES) {
        this._flush();
      }
    }

    return true;
  }

  _flush() {
    // Transfer (not copy) the underlying ArrayBuffer to the main thread.
    // This hands off ownership of the memory across the thread boundary
    // instead of cloning it — this runs roughly ten times a second for the
    // entire duration of every call, so avoiding a copy here is worthwhile.
    this.port.postMessage(
      { type: "batch", samples: this._buffer, sampleRate },
      [this._buffer.buffer]
    );

    // The buffer just transferred is now detached and unusable on this
    // side, so a fresh one takes over for the next batch.
    this._buffer = new Float32Array(BATCH_SIZE_SAMPLES);
    this._writeIndex = 0;
  }
}

// `sampleRate` (referenced above) and `registerProcessor` are both globals
// provided by AudioWorkletGlobalScope — not imports, not typos.
registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
