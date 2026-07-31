import torch
import torchaudio

SAMPLE_RATE = 16_000
WINDOW_SAMPLES = 4 * SAMPLE_RATE      # 64,000
HOP_SAMPLES = 2 * SAMPLE_RATE         # 32,000
MIN_WINDOW_SAMPLES = int(1.5 * SAMPLE_RATE)  # shortest window we'll still score

def resample_to_16k(waveform: torch.Tensor, orig_sr: int) -> torch.Tensor:
    """Telephony audio (commonly 8kHz) is upsampled; wideband audio is
    downsampled. Single normalized rate downstream regardless of call leg."""
    if orig_sr == SAMPLE_RATE:
        return waveform
    return torchaudio.functional.resample(waveform, orig_sr, SAMPLE_RATE)

def normalize_window(window: torch.Tensor) -> torch.Tensor:
    window = window - window.mean()                 # remove DC offset
    peak = window.abs().max().clamp(min=1e-6)
    return window * (0.95 / peak)                    # peak-normalize to 0.95

def sliding_windows(active_speech: torch.Tensor):
    """Yields (window_tensor, start_sample, end_sample). Windows shorter than
    MIN_WINDOW_SAMPLES at the tail of a call are dropped, not zero-padded —
    zero-padding teaches the model an artificial "hard silence" boundary it
    will never see in production and can itself become a spurious cue.
    Windows between MIN_WINDOW_SAMPLES and WINDOW_SAMPLES are scored as-is;
    both Stage 1 and Stage 2 below are built to accept variable-length input."""
    n = active_speech.shape[-1]
    if n < MIN_WINDOW_SAMPLES:
        return
    start = 0
    while start < n:
        end = min(start + WINDOW_SAMPLES, n)
        if end - start >= MIN_WINDOW_SAMPLES:
            yield normalize_window(active_speech[..., start:end]), start, end
        if end == n:
            break
        start += HOP_SAMPLES
