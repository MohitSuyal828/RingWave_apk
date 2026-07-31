# RingWave Detection Service

FastAPI service that receives real-time microphone audio chunks from active
RingWave calls over WebSocket and returns voice-authenticity verdicts,
using a trained Stage 1 (LFCC-LCNN) deepfake detection model.

The model code (`ringwave_deepfake/audio/`, `ringwave_deepfake/models/`) and
the trained checkpoint (`checkpoints/stage1/best.pt`) are vendored from a
separate training project — see `ringwave_deepfake/README_VENDORED.md` for
exactly what was copied and what was deliberately left out. All real
inference logic specific to this service lives in `app/predictor.py`;
everything else (the WebSocket route, auth, binary protocol decoding) is
unchanged from before the model was integrated.

## Relationship to the rest of RingWave

This service is **standalone** — it has no dependency on the Node backend,
Postgres, or Socket.IO at runtime. The browser (via
`frontend/src/services/detectionTransport.ts`) connects to it directly over
a dedicated WebSocket, separate from the app's existing Socket.IO
connection used for call signaling.

The one thing the two backends share is a JWT secret: this service verifies
the exact same short-lived access token the browser already holds for the
REST API (see `backend/src/utils/token.js`), rather than inventing a second
credential system. See **Auth** below.

```
Browser mic
  → AudioChunker (frontend/src/lib/audio/AudioChunker.ts)
  → DetectionTransport (frontend/src/services/detectionTransport.ts)
  → WebSocket  ──────────────────────────────────────────────────►  this service
                                                                     (/ws/detect)
  ◄────────────────────────────────────────────────  {"type": "verdict", ...}
```

## Setup

```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate          # .venv\Scripts\activate on Windows
pip install -r requirements.txt
cp .env.example .env               # then edit .env — see Configuration below
```

## Running

```bash
uvicorn app.main:app --reload --port 8000
```

or `python -m app.main` (the `if __name__ == "__main__"` block in
`app/main.py` does the same thing).

Confirm it's up:

```bash
curl http://localhost:8000/health
# {"status": "ok", "service": "ringwave-detection", "model_device": "cpu"}
```

Then point the frontend at it — set `VITE_DETECTION_WS_URL` in
`frontend/.env` to `ws://localhost:8000/ws/detect` (see
`frontend/.env.example`).

## Configuration

See `.env.example` for the full list. The one setting worth calling out:

- **`JWT_SECRET`** — must match the Node backend's `JWT_SECRET`
  (`backend/.env`) for real token verification. **If left unset, this
  service falls back to accepting any non-empty token**, logging a warning
  on every connection. That fallback exists so this service can be started
  and poked at entirely on its own, without also standing up the full
  Node backend + Postgres — it must never be relied on in production.

## Testing

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

`tests/test_detection_ws.py` runs the whole auth handshake + binary chunk
protocol against an in-process `TestClient` (no separate server process
needed) using an encoder that independently reproduces
`detectionProtocol.ts`'s exact wire format — these tests exist specifically
to catch a client/server protocol mismatch, not to test prediction quality.

## Protocol summary

Full detail lives in the docstrings of `app/routes/detection_ws.py`,
`app/protocol.py`, and `app/schemas.py` — summary:

1. Client connects to `/ws/detect`.
2. Client sends `{"type": "auth", "token": "<jwt>"}` as its first message.
3. Server replies `{"type": "auth_ack"}` or `{"type": "auth_error",
   "reason": "..."}` (and closes the socket on error).
4. Client sends one **binary** frame per audio chunk:
   `[4-byte LE header length][UTF-8 JSON header][raw little-endian float32
   PCM samples]`.
5. Server replies with one `{"type": "verdict", "prediction",
   "confidence_score", "processing_time_ms"}` text message per chunk.
6. A malformed chunk gets `{"type": "error", "reason": "..."}` back without
   the connection being closed — only a genuine disconnect ends it.

## Model

`app/predictor.py` loads `checkpoints/stage1/best.pt` into `Stage1LCNN`
exactly once, at process startup (a module-level singleton — see that
file's docstring) — never reloaded per request/connection. Per chunk:

1. Resample this chunk's samples (whatever rate the browser mic used,
   from the chunk header) to the model's 16kHz.
2. VAD-gate: drop non-speech 30ms frames (WebRTC VAD). A chunk that's
   entirely silence short-circuits to a fixed `"uncertain"` verdict
   without running the model.
3. Window with the model's own `sliding_windows()` (typically exactly one
   window per 4s chunk) and run each through the LFCC frontend + Stage1LCNN.
4. Map the worst (most fake-looking) window's probability to
   `likely_real` / `likely_fake` / `uncertain` using `tau1` (default
   `0.05`, matching how the checkpoint was actually trained — see
   `checkpoints/stage1/config.yaml`), and to a 0-100 `confidence_score`
   (distance from the 50/50 decision boundary).

Relevant settings (see `.env.example`): `AI_SERVICE_CHECKPOINT_PATH`,
`AI_SERVICE_MODEL_DEVICE` (`cpu` by default — this model is small enough
that CPU inference is comfortably fast enough for one ~4s chunk at a
time), `AI_SERVICE_TAU1`, `AI_SERVICE_USE_VAD`.

Stage 2 (the prompted-XLSR verification cascade described in
`ringwave-deepfake-architecture.md`) was never trained and is not part of
this integration — only Stage 1's trained checkpoint exists, so only
Stage 1 is used.
