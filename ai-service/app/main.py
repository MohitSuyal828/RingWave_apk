# ===========================================================================
# main.py — FastAPI application entry point for the AI voice-detection
# service.
#
# Run standalone with:
#     uvicorn app.main:app --reload --port 8000
# (from the ai-service/ directory, with dependencies from requirements.txt
# installed — see ai-service/README.md).
#
# This service has no dependency on the Node backend, Postgres, or
# Socket.IO at runtime — it only needs to verify the SAME JWT the frontend
# already holds (see config.py / auth.py), via a shared JWT_SECRET env
# var. It can be started, health-checked, and connected to entirely on its
# own, independent of whether the rest of RingWave is running.
# ===========================================================================

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.predictor import predictor
from app.routes.detection_ws import router as detection_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("detection.main")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if not settings.jwt_secret:
        logger.warning(
            "JWT_SECRET is not set — the detection socket will accept any "
            "non-empty token. Set JWT_SECRET (matching the Node backend's) "
            "before running this service against real traffic."
        )
    # `predictor` (see app/predictor.py) is a module-level singleton --
    # by the time this lifespan function runs, it has already been
    # imported (and the checkpoint already loaded) exactly once, as a
    # side effect of this module's own top-level imports above. A failed
    # checkpoint load raises ModelLoadError there, which aborts the
    # process before it ever starts accepting connections -- this log
    # line is just a visible confirmation that didn't happen.
    logger.info(
        "RingWave Detection Service starting on %s:%s (Stage 1 model loaded, device=%s)",
        settings.host,
        settings.port,
        predictor.device,
    )
    yield


app = FastAPI(
    title="RingWave Detection Service",
    description=(
        "Receives real-time microphone audio chunks from RingWave calls and "
        "returns voice-authenticity verdicts over WebSocket, using a trained "
        "Stage 1 (LFCC-LCNN) deepfake detection model (see app/predictor.py)."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

# Browsers don't apply CORS the same way to raw WebSocket upgrade requests
# as they do to fetch/XHR, but Starlette's CORSMiddleware still governs
# /health and any future plain HTTP routes on this service, so it's
# configured for consistency rather than left to the WS-only default.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detection_router)


@app.get("/health")
def health() -> dict:
    """Plain liveness/readiness check. Not part of the detection protocol
    itself — just enough to confirm the service is up and which model
    device it's serving predictions from."""
    return {"status": "ok", "service": "ringwave-detection", "model_device": str(predictor.device)}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
