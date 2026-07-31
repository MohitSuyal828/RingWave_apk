// Lightweight persisted app preferences.
//
// These are genuinely client-only settings (no server concept of them
// exists, and there's no reason one should) — noise cancellation/echo
// reduction are real MediaTrackConstraints applied to the mic before every
// call, and the call-alert sound is read by IncomingCallPage. Persisted to
// localStorage so they survive a reload.

export interface AppSettings {
  callAlertSound: boolean;
  noiseCancellation: boolean;
  echoReduction: boolean;
  /** Gates the AudioChunker/DetectionTransport pipeline in CallContext —
   *  real-time voice-authenticity analysis genuinely runs today, against
   *  the real Stage 1 model in ai-service/app/predictor.py, so this is a
   *  live, working switch rather than a "coming soon" placeholder.
   *  Defaults on since that's the pipeline's existing always-on
   *  behavior. */
  aiDetectionEnabled: boolean;
}

const STORAGE_KEY = "ringwave:settings";

const DEFAULTS: AppSettings = {
  callAlertSound: true,
  noiseCancellation: true,
  echoReduction: true,
  aiDetectionEnabled: true,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K]
): AppSettings {
  const next = { ...getSettings(), [key]: value };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable (private browsing, quota, etc.) — setting just
    // won't persist across reloads; not worth surfacing an error for.
  }

  return next;
}

/** Plays a short two-tone chime using the Web Audio API — no audio asset needed. */
function playChimeOnce() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.linearRampToValueAtTime(0, start + 0.16);

      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.18);
    });

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Audio unavailable/blocked — not worth surfacing an error for a chime.
  }
}

export function playCallAlertTone() {
  if (!getSettings().callAlertSound) return;
  playChimeOnce();
}

/**
 * Starts repeating the chime every `intervalMs` until stopped — used for
 * an actual incoming-call ring rather than a single blip. Returns a stop
 * function; safe to call even if the sound setting is off (no-op).
 */
export function startCallAlertRinging(
  intervalMs = 2200,
  isMuted: () => boolean = () => false
): () => void {
  if (!getSettings().callAlertSound) return () => {};

  if (!isMuted()) playChimeOnce();
  const interval = setInterval(() => {
    if (!isMuted()) playChimeOnce();
  }, intervalMs);

  return () => clearInterval(interval);
}
