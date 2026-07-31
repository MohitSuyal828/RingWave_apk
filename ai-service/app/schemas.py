# ===========================================================================
# schemas.py — Pydantic models for the JSON messages exchanged over the
# detection WebSocket (everything except the binary chunk frames — see
# protocol.py for those).
#
# Defining these explicitly means the wire contract lives in one place and
# FastAPI/Pydantic validates every outgoing message against it, instead of
# hand-built dicts that could silently drift from what the frontend
# (detectionTransport.ts) actually expects.
# ===========================================================================

from typing import Literal, Optional

from pydantic import BaseModel


class AuthMessage(BaseModel):
    """The client's first message after the socket opens — matches
    DetectionTransport.handleOpen() in the frontend."""

    type: Literal["auth"]
    token: Optional[str] = None


class AuthAckMessage(BaseModel):
    """Sent once verify_token() accepts the client's token. The frontend
    treats receiving this as "connection ready" and flushes any queued
    chunks (see DetectionTransport.handleMessage)."""

    type: Literal["auth_ack"] = "auth_ack"


class AuthErrorMessage(BaseModel):
    """Sent (then the socket is closed) when the auth message is missing,
    malformed, or the token is rejected."""

    type: Literal["auth_error"] = "auth_error"
    reason: str


class ErrorMessage(BaseModel):
    """Sent for a per-chunk problem (e.g. a malformed binary frame) that
    doesn't warrant closing the connection."""

    type: Literal["error"] = "error"
    reason: str


# The three labels the Stage 1 model's prediction is mapped into (see
# app/predictor.py). Deliberately a small, explicit set rather than
# open-ended strings, so the frontend's mapping from prediction -> UI
# state (see frontend/src/services/detectionVerdict.ts) can be exhaustive.
Prediction = Literal["likely_real", "likely_fake", "uncertain"]


class VerdictMessage(BaseModel):
    """
    One detection result for one received chunk.

    `prediction` and `confidence_score` come from the trained Stage 1
    (LFCC-LCNN) model (see app/predictor.py) — this schema is the same
    permanent contract used since before the model was integrated, and
    the frontend/WebSocket route needed no changes when the values
    behind it stopped being placeholders. `processing_time_ms` is
    genuinely measured (see routes/detection_ws.py), covering the full
    decode + inference time for this chunk.
    """

    type: Literal["verdict"] = "verdict"
    prediction: Prediction
    confidence_score: float
    processing_time_ms: float
