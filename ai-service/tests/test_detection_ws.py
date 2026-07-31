# ===========================================================================
# test_detection_ws.py — end-to-end protocol/auth tests for /ws/detect,
# using Starlette's in-process TestClient (no real network socket, no
# separately-running server needed to run these).
#
# What these tests are for: catching a client/server wire-format or
# auth-contract mismatch — the failure mode that actually matters here.
# They deliberately don't assert *which* prediction comes back (that's
# governed by the trained model in app/predictor.py, not by this route) —
# a request encoded exactly the way
# frontend/src/services/detectionProtocol.ts encodes it should always get
# a well-formed response back, regardless of what the model returns for
# that particular (here, randomly generated) audio.
#
# Run with: pytest (from the ai-service/ directory, after installing
# requirements.txt and requirements-dev.txt).
# ===========================================================================

import dataclasses
import json
import struct
import time

import jwt
import numpy as np
import pytest
from starlette.testclient import TestClient

from app import auth as auth_module
from app.config import settings as base_settings
from app.main import app

SECRET = "test-shared-secret"


def encode_chunk_frame(samples: np.ndarray, sample_rate: int, sequence: int) -> bytes:
    """
    Byte-for-byte the same wire format as
    frontend/src/services/detectionProtocol.ts's encodeChunkMessage:

        [ 4 bytes ] header length, little-endian uint32
        [ N bytes ] header, UTF-8 JSON
        [ M bytes ] raw PCM samples, 32-bit float, little-endian, mono

    Kept here (rather than imported from app.protocol) deliberately —
    these tests exist to prove the *frontend's* format decodes correctly,
    so the encoder here is an independent implementation of that format,
    not a call into the same code being tested.
    """
    header = {
        "sequence": sequence,
        "sampleRate": sample_rate,
        "sampleCount": len(samples),
        "durationMs": round(len(samples) / sample_rate * 1000),
        "timestamp": int(time.time() * 1000),
        "encoding": "float32le",
    }
    header_bytes = json.dumps(header).encode("utf-8")
    pcm_bytes = samples.astype("<f4").tobytes()
    return struct.pack("<I", len(header_bytes)) + header_bytes + pcm_bytes


def _sign(payload: dict) -> str:
    return jwt.encode(payload, SECRET, algorithm="HS256")


def valid_token() -> str:
    # Mirrors backend/src/utils/token.js's generateAccessToken exactly:
    # HS256, {id, email} payload, issuer "ringwave-api". jsonwebtoken's
    # `issuer` sign option adds the "iss" claim automatically; PyJWT has
    # no equivalent option, so it's included explicitly here.
    now = int(time.time())
    return _sign({"id": 1, "email": "user@example.com", "iat": now, "exp": now + 900, "iss": "ringwave-api"})


def expired_token() -> str:
    now = int(time.time())
    return _sign({"id": 1, "email": "user@example.com", "iat": now - 1000, "exp": now - 100, "iss": "ringwave-api"})


def wrong_issuer_token() -> str:
    now = int(time.time())
    return _sign({"id": 1, "email": "user@example.com", "iat": now, "exp": now + 900, "iss": "someone-else"})


@pytest.fixture
def strict_auth(monkeypatch):
    """Configures the service to verify real HS256/issuer-checked JWTs —
    the mode it must run in against the real Node backend. Settings is a
    frozen dataclass singleton imported by reference into app.auth, so the
    replacement is patched onto that module directly rather than mutated
    in place."""
    patched = dataclasses.replace(
        base_settings, jwt_secret=SECRET, jwt_issuer="ringwave-api", jwt_algorithm="HS256"
    )
    monkeypatch.setattr(auth_module, "settings", patched)
    return patched


@pytest.fixture
def permissive_auth(monkeypatch):
    """Configures the service's development-only fallback (no JWT_SECRET
    configured) — any non-empty token is accepted. Used by the chunk-
    protocol tests below, which care about frame decoding, not auth."""
    patched = dataclasses.replace(base_settings, jwt_secret=None)
    monkeypatch.setattr(auth_module, "settings", patched)
    return patched


@pytest.fixture
def client():
    return TestClient(app)


class TestAuthHandshake:
    def test_valid_token_is_accepted(self, client, strict_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": valid_token()})
            assert ws.receive_json() == {"type": "auth_ack"}

    def test_expired_token_is_rejected(self, client, strict_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": expired_token()})
            assert ws.receive_json()["type"] == "auth_error"

    def test_wrong_issuer_is_rejected(self, client, strict_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": wrong_issuer_token()})
            assert ws.receive_json()["type"] == "auth_error"

    def test_missing_token_is_rejected(self, client, strict_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth"})
            assert ws.receive_json()["type"] == "auth_error"

    def test_permissive_mode_accepts_any_nonempty_token(self, client, permissive_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": "anything-non-empty"})
            assert ws.receive_json() == {"type": "auth_ack"}


class TestChunkProtocol:
    def test_valid_chunk_receives_a_wellformed_verdict(self, client, permissive_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": "dev-token"})
            ws.receive_json()

            samples = np.random.uniform(-1, 1, size=4000).astype(np.float32)
            ws.send_bytes(encode_chunk_frame(samples, sample_rate=48000, sequence=0))

            verdict = ws.receive_json()
            assert verdict["type"] == "verdict"
            assert verdict["prediction"] in ("likely_real", "likely_fake", "uncertain")
            assert 0 <= verdict["confidence_score"] <= 100
            assert verdict["processing_time_ms"] >= 0

    def test_multiple_sequential_chunks_each_get_a_verdict(self, client, permissive_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": "dev-token"})
            ws.receive_json()

            for seq in range(5):
                samples = np.random.uniform(-1, 1, size=1000).astype(np.float32)
                ws.send_bytes(encode_chunk_frame(samples, sample_rate=48000, sequence=seq))
                assert ws.receive_json()["type"] == "verdict"

    def test_malformed_frame_returns_error_without_closing_connection(self, client, permissive_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": "dev-token"})
            ws.receive_json()

            # Declares a header far longer than the actual frame.
            ws.send_bytes(struct.pack("<I", 999_999) + b"short")
            assert ws.receive_json()["type"] == "error"

            # The connection must still be usable after a bad frame.
            samples = np.random.uniform(-1, 1, size=1000).astype(np.float32)
            ws.send_bytes(encode_chunk_frame(samples, sample_rate=48000, sequence=1))
            assert ws.receive_json()["type"] == "verdict"

    def test_sample_count_mismatch_is_rejected(self, client, permissive_auth):
        with client.websocket_connect("/ws/detect") as ws:
            ws.send_json({"type": "auth", "token": "dev-token"})
            ws.receive_json()

            header = {
                "sequence": 0,
                "sampleRate": 48000,
                "sampleCount": 9999,  # deliberately wrong vs. the actual payload
                "durationMs": 4000,
                "timestamp": int(time.time() * 1000),
                "encoding": "float32le",
            }
            header_bytes = json.dumps(header).encode("utf-8")
            pcm_bytes = np.zeros(10, dtype="<f4").tobytes()
            frame = struct.pack("<I", len(header_bytes)) + header_bytes + pcm_bytes

            ws.send_bytes(frame)
            assert ws.receive_json()["type"] == "error"
