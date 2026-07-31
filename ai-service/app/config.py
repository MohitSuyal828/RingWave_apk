# ===========================================================================
# config.py — environment-driven settings for the AI detection service.
#
# Mirrors the Node backend's convention of reading configuration from
# environment variables (see backend/.env.example) instead of hardcoding
# values. Loaded once at import time and shared as a module-level singleton
# (`settings`) — this service is small enough that a settings object plus
# plain os.getenv() calls is clearer than pulling in a config framework.
# ===========================================================================

import os
from dataclasses import dataclass, field
from dotenv import load_dotenv

load_dotenv()


def _get_list(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


@dataclass(frozen=True)
class Settings:
    host: str = os.getenv("AI_SERVICE_HOST", "0.0.0.0")
    port: int = int(os.getenv("AI_SERVICE_PORT", "8000"))

    # ─── Auth ──────────────────────────────────────────────────────────────
    # Shared secret with the Node backend's JWT_SECRET (see
    # backend/.env.example and backend/src/utils/token.js) — this service
    # verifies the SAME short-lived access tokens the browser already holds
    # for the REST API and Socket.IO, rather than inventing a second
    # credential system. If unset, auth.py falls back to a permissive
    # "any non-empty token" placeholder with a loud startup warning —
    # convenient for running this service standalone in development, never
    # intended for production use.
    jwt_secret: str | None = os.getenv("JWT_SECRET") or None
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")
    jwt_issuer: str = os.getenv("JWT_ISSUER", "ringwave-api")

    allowed_origins: list[str] = field(
        default_factory=lambda: _get_list("AI_SERVICE_ALLOWED_ORIGINS", ["*"])
    )

    # ─── Protocol ────────────────────────────────────────────────────────
    # Kept in sync with CHUNK_DURATION_SECONDS in
    # frontend/src/lib/audio/AudioChunker.ts by convention (there is no
    # shared import across the JS/Python boundary — see that file). Used
    # here only to log a sanity-check warning on a wildly-off chunk
    # duration, never to alter decoding itself.
    expected_chunk_duration_seconds: float = float(
        os.getenv("AI_SERVICE_EXPECTED_CHUNK_DURATION_SECONDS", "4.0")
    )

    # ─── Stage 1 model ───────────────────────────────────────────────────
    # See app/predictor.py. model_device/model_use_vad match how
    # checkpoints/stage1/best.pt was actually trained and verified to
    # load/run in this repo.
    #
    # model_tau1 / model_tau2 replace what used to be a single symmetric
    # threshold (tau1 and its mirror image 1-tau1). They're independent on
    # purpose: tau1 is the cutoff below which a chunk is called
    # "likely_real", tau2 is the cutoff above which it's called
    # "likely_fake" (tau1 < tau2 always; anything in between is
    # "uncertain"). Keeping them separate is what makes it possible to
    # tighten the real-speech false-positive rate (raise tau1) without
    # simultaneously loosening how confidently something has to score to
    # be flagged fake (tau2 stays put).
    #
    # Defaults: tau1=0.12 is a documented STARTING HEURISTIC, not a
    # value calibrated against held-out genuine-speech scores -- this repo
    # has no labeled genuine/fake audio available to calibrate against
    # (ml/datasets/ is empty). The reasoning behind widening tau1 from the
    # training-time value of 0.05 (checkpoints/stage1/config.yaml's
    # train.tau1) to 0.12: the model was trained on ASVspoof2019 LA, which
    # is clean studio-quality audio, while this service scores live
    # browser-mic audio that's additionally passed through the browser's
    # own AGC/echo-cancellation and, upstream of that, real network
    # conditions -- processing genuine speech has never seen in training,
    # which tends to push genuine scores away from the model's most
    # confident "real" region. Widening the real-side margin is a
    # reasonable hedge against that domain shift specifically because it
    # only affects the boundary for calling something "real" -- it doesn't
    # touch tau2, so it can't make a confident fake harder to catch.
    # tau2 is left at 0.95 (unchanged from the training-time symmetric
    # value) for exactly that reason: there's no evidence motivating a
    # change there, so it isn't moved. Once real genuine-call recordings
    # (or the ASVspoof dev split config.yaml already points at) are
    # available, run scripts/calibrate_thresholds.py against this same
    # frozen checkpoint to replace these with values calibrated to an
    # actual target false-positive rate instead of a heuristic.
    model_checkpoint_path: str | None = os.getenv("AI_SERVICE_CHECKPOINT_PATH") or None
    model_device: str = os.getenv("AI_SERVICE_MODEL_DEVICE", "cpu")
    model_tau1: float = float(os.getenv("AI_SERVICE_TAU1", "0.12"))
    model_tau2: float = float(os.getenv("AI_SERVICE_TAU2", "0.95"))
    model_use_vad: bool = os.getenv("AI_SERVICE_USE_VAD", "true").strip().lower() not in (
        "0", "false", "no",
    )


settings = Settings()
