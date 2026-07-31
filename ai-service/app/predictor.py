# ===========================================================================
# predictor.py — real Stage 1 (LFCC-LCNN) inference, replacing dummy.py.
#
# Loads the trained checkpoint (checkpoints/stage1/best.pt) ONCE, at import
# time (see the `predictor` singleton at the bottom of this file) — never
# reloaded per request. `detection_ws.py` imports that singleton and calls
# `predictor.predict(decoded)` once per received chunk; everything else
# about the WebSocket route, the auth handshake, and the wire protocol is
# unchanged from the dummy-predictor milestone.
#
# Model code (ringwave_deepfake/audio/, ringwave_deepfake/models/) is
# vendored from a separate training project (see
# ringwave_deepfake/README_VENDORED.md in this directory for exactly what
# was copied and, deliberately, what was left out — Stage 2 was never
# trained and isn't part of this integration). Nothing under
# ringwave_deepfake/ was modified from that project.
#
# Preprocessing mirrors ringwave_deepfake's own (untouched)
# inference/pipeline.py, scoped to one already-chunked ~4s segment instead
# of a whole call:
#   1. Resample this chunk's samples (arbitrary browser mic rate, e.g.
#      48kHz) to the model's 16kHz.
#   2. VAD-gate: keep only the 30ms frames WebRTC VAD calls speech,
#      concatenated. A chunk that's entirely silence short-circuits to a
#      fixed "uncertain" verdict rather than being pushed through the model.
#   3. Window the VAD-trimmed audio with the model's own sliding_windows()
#      (this typically yields exactly one window per 4s chunk, since the
#      window length and the chunk length are both 4s by convention — see
#      AudioChunker.ts's CHUNK_DURATION_SECONDS and windowing.py's
#      WINDOW_SAMPLES — but sliding_windows() is reused as-is rather than
#      assumed, so this keeps working correctly if either constant ever
#      changes).
#   4. Run each window through the (fixed, untrained-further) LFCC
#      frontend and Stage1LCNN; take the worst (most fake-looking) window
#      in this chunk as the chunk's score, consistent with
#      ringwave_deepfake.inference.session's "any confirmed-fake" posture,
#      scaled down from a whole call to one chunk.
#
# tau1/tau2 (defaults 0.12 / 0.95 -- see app/config.py for the full
# rationale) are the ONLY thresholds used here -- Stage 2 was never
# trained, so there is no verification cascade to escalate to. A
# probability below tau1 is "likely_real", at or above tau2 is
# "likely_fake"; anything in [tau1, tau2) is reported as "uncertain"
# rather than guessed at either extreme. tau1 and tau2 are independent
# (not mirror images of each other) specifically so the real-side cutoff
# can be calibrated for genuine-speech false positives without touching
# how confidently a chunk must score to be flagged fake.
# ===========================================================================

import logging
import sys
import time
from pathlib import Path

import numpy as np
import torch

# Vendored ringwave_deepfake lives at ai-service/ringwave_deepfake/, a
# sibling of this app/ package. Resolved from __file__ rather than
# relying on the process's current working directory, so this import
# works the same whether the service is started via
# `uvicorn app.main:app` from ai-service/, from a different cwd, or
# packaged into a container — nothing else in this service depends on
# cwd, and this shouldn't be the exception.
_AI_SERVICE_ROOT = Path(__file__).resolve().parent.parent
if str(_AI_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(_AI_SERVICE_ROOT))

from ringwave_deepfake.audio.features import LFCCFrontend  # noqa: E402
from ringwave_deepfake.audio.vad import VADGate  # noqa: E402
from ringwave_deepfake.audio.windowing import (  # noqa: E402
    MIN_WINDOW_SAMPLES,
    SAMPLE_RATE as MODEL_SAMPLE_RATE,
    resample_to_16k,
    sliding_windows,
)
from ringwave_deepfake.models.stage1_lcnn import Stage1LCNN  # noqa: E402

from app.config import settings
from app.protocol import DecodedChunk
from app.schemas import Prediction, VerdictMessage

logger = logging.getLogger("detection.predictor")


class ModelLoadError(RuntimeError):
    """Raised when the checkpoint can't be loaded at startup. Deliberately
    fatal (see main.py's lifespan) -- a service that silently fell back to
    guessing would be worse than one that refuses to start."""


class Stage1Predictor:
    def __init__(
        self,
        checkpoint_path: str | Path,
        device: str = "cpu",
        tau1: float = 0.12,
        tau2: float = 0.95,
        use_vad: bool = True,
    ):
        if not (0.0 <= tau1 < tau2 <= 1.0):
            raise ValueError(
                f"Invalid thresholds: need 0 <= tau1 < tau2 <= 1, got tau1={tau1}, tau2={tau2}"
            )

        self.device = torch.device(device)
        self.tau1 = tau1
        self.tau2 = tau2

        checkpoint_path = Path(checkpoint_path)
        if not checkpoint_path.exists():
            raise ModelLoadError(
                f"Stage 1 checkpoint not found at {checkpoint_path}. "
                f"Set AI_SERVICE_CHECKPOINT_PATH if it lives somewhere else."
            )

        try:
            checkpoint = torch.load(checkpoint_path, map_location=self.device, weights_only=False)
        except Exception as exc:
            raise ModelLoadError(f"Failed to load checkpoint {checkpoint_path}: {exc}") from exc

        # train_stage1.py's checkpoint.py wraps the model weights in
        # {"model_state_dict": ...} alongside optimizer/scheduler state
        # (see checkpoint.py in the training project) -- but tolerate a
        # bare state_dict too, in case a checkpoint is ever re-exported
        # without that wrapper (e.g. a hand-trimmed inference-only copy).
        state_dict = checkpoint.get("model_state_dict", checkpoint) if isinstance(checkpoint, dict) else checkpoint

        self.model = Stage1LCNN().to(self.device)
        try:
            self.model.load_state_dict(state_dict, strict=True)
        except (RuntimeError, KeyError) as exc:
            raise ModelLoadError(
                f"Checkpoint at {checkpoint_path} doesn't match Stage1LCNN's "
                f"architecture: {exc}"
            ) from exc
        self.model.eval()
        for p in self.model.parameters():
            p.requires_grad = False

        # LFCC is a fixed signal-processing transform, not learned -- no
        # checkpoint needed for it, same instantiation as training.
        self.frontend = LFCCFrontend().to(self.device)
        self.frontend.eval()
        for p in self.frontend.parameters():
            p.requires_grad = False

        self.vad = VADGate() if use_vad else None

        n_params = sum(p.numel() for p in self.model.parameters())
        epoch = checkpoint.get("epoch") if isinstance(checkpoint, dict) else None
        best_metric = checkpoint.get("best_metric") if isinstance(checkpoint, dict) else None
        logger.info(
            "Stage 1 model loaded: %s (%d params, device=%s, tau1=%.3f, tau2=%.3f, vad=%s, "
            "checkpoint epoch=%s, val_eer=%s)",
            checkpoint_path, n_params, self.device, self.tau1, self.tau2, self.vad is not None,
            epoch, f"{best_metric:.4f}" if isinstance(best_metric, float) else best_metric,
        )

    def _vad_trim(self, waveform_16k: torch.Tensor) -> torch.Tensor | None:
        """Keeps only the speech frames per WebRTC VAD; returns None if the
        chunk is entirely non-speech."""
        assert self.vad is not None
        pcm16_bytes = (
            waveform_16k.clamp(-1.0, 1.0).mul(32767.0).to(torch.int16).numpy().tobytes()
        )
        mask = self.vad.speech_mask(pcm16_bytes)
        frame_samples = self.vad.frame_samples

        active = [
            waveform_16k[i * frame_samples:(i + 1) * frame_samples]
            for i, is_speech in enumerate(mask)
            if is_speech
        ]
        if not active:
            return None
        return torch.cat(active)

    @torch.no_grad()
    def score_p_fake(self, decoded: DecodedChunk) -> float | None:
        """Runs one already-decoded chunk through resampling, VAD, windowing,
        and the model, returning the chunk's raw fake-probability score.

        Returns None for chunks with no signal to score (silence, VAD found
        no speech, or too short after trimming) -- predict() maps that case
        to an "uncertain" verdict; scripts/calibrate_thresholds.py skips
        those samples rather than forcing a score out of them. This is the
        one place that owns the actual preprocessing + model forward pass,
        so predict() and the calibration script can never drift apart on
        what "the model's score for this chunk" means.
        """
        header_sample_rate = decoded.header.get("sampleRate")
        if not isinstance(header_sample_rate, (int, float)) or header_sample_rate <= 0:
            # protocol.py already validates sampleCount against the payload
            # size, but sampleRate is only used here, not there -- guard
            # it the same defensive way rather than crashing this chunk.
            logger.warning(
                "Chunk missing/invalid header.sampleRate (%r); assuming %dHz",
                header_sample_rate, MODEL_SAMPLE_RATE,
            )
            header_sample_rate = MODEL_SAMPLE_RATE

        if decoded.sample_count == 0:
            return None

        waveform = torch.frombuffer(decoded.samples, dtype=torch.float32).clone()
        waveform = resample_to_16k(waveform, int(header_sample_rate))

        if self.vad is not None:
            trimmed = self._vad_trim(waveform)
            if trimmed is None:
                # Entirely non-speech chunk (e.g. a silent line, hold
                # music, or a mic that's temporarily muted) -- nothing to
                # score, and forcing a verdict out of pure silence would
                # be noise, not signal.
                return None
            waveform = trimmed

        if waveform.shape[-1] < MIN_WINDOW_SAMPLES:
            # Too short to be a meaningful acoustic sample regardless --
            # matches MIN_WINDOW_SAMPLES's own "shortest window we'll
            # still score" semantics from windowing.py exactly (whether
            # the shortness came from a short chunk to begin with or
            # from VAD trimming away most of a longer one). This also
            # sidesteps a real crash: Stage1LCNN's three rounds of 2x2
            # max-pooling collapse the LFCC time dimension to zero on
            # inputs this short, raising a RuntimeError from
            # torch.max_pool2d rather than producing a (bad but
            # harmless) prediction -- confirmed during integration
            # testing with a deliberately tiny synthetic chunk.
            return None

        windows = list(sliding_windows(waveform.unsqueeze(0)))
        if not windows:
            # Shouldn't happen given the length check just above
            # (sliding_windows uses the same MIN_WINDOW_SAMPLES cutoff),
            # but never leave a chunk unanswered if it somehow does.
            return None

        p_fake_per_window = []
        for window, _start_sample, _end_sample in windows:
            features = self.frontend(window.to(self.device))
            logit = self.model(features)
            p_fake_per_window.append(torch.sigmoid(logit).item())

        return max(p_fake_per_window)

    @torch.no_grad()
    def predict(self, decoded: DecodedChunk) -> VerdictMessage:
        """One verdict for one already-decoded chunk. Never raises for a
        structurally valid chunk (including all-silence or very-short
        edge cases) -- detection_ws.py's per-connection loop depends on
        getting exactly one verdict back per chunk it forwards here.
        """
        start = time.perf_counter()

        p_fake = self.score_p_fake(decoded)
        if p_fake is None:
            return self._make_verdict("uncertain", 50.0, start)

        if p_fake <= self.tau1:
            prediction: Prediction = "likely_real"
        elif p_fake >= self.tau2:
            prediction = "likely_fake"
        else:
            prediction = "uncertain"

        # Distance from the 50/50 decision boundary, scaled to a 0-100
        # "how confident is this verdict" number: 100 at either extreme,
        # ~50 for a genuinely borderline probability -- deliberately the
        # same range/shape dummy.py's placeholder used, so the frontend's
        # existing confidence display needs no changes.
        confidence_score = round(max(p_fake, 1.0 - p_fake) * 100.0, 1)

        return self._make_verdict(prediction, confidence_score, start)

    @staticmethod
    def _make_verdict(prediction: Prediction, confidence_score: float, start: float) -> VerdictMessage:
        processing_time_ms = (time.perf_counter() - start) * 1000
        return VerdictMessage(
            prediction=prediction,
            confidence_score=confidence_score,
            processing_time_ms=round(processing_time_ms, 1),
        )


def _resolve_checkpoint_path() -> Path:
    configured = settings.model_checkpoint_path
    if configured:
        return Path(configured)
    return _AI_SERVICE_ROOT / "checkpoints" / "stage1" / "best.pt"


# Loaded exactly once, at first import of this module (i.e. once per
# service process, when app.main imports app.routes.detection_ws, which
# imports this module) -- see main.py's lifespan for the startup check
# that surfaces a load failure immediately instead of on the first
# WebSocket connection.
predictor = Stage1Predictor(
    checkpoint_path=_resolve_checkpoint_path(),
    device=settings.model_device,
    tau1=settings.model_tau1,
    tau2=settings.model_tau2,
    use_vad=settings.model_use_vad,
)
