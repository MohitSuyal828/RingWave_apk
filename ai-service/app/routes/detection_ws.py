# ===========================================================================
# detection_ws.py — the /ws/detect WebSocket endpoint.
#
# Per-connection lifecycle:
#   1. Accept the socket.
#   2. Wait for the client's `{"type": "auth", "token": ...}` message (see
#      DetectionTransport.handleOpen in the frontend) and verify it via
#      auth.verify_token(). Reply with auth_ack or auth_error; a rejected
#      or missing/late auth message closes the connection without
#      entering the chunk loop.
#   3. Loop: receive one binary frame per message, decode it with
#      protocol.decode_chunk_frame(), and reply with a real verdict from
#      the trained Stage 1 model (see app/predictor.py). A single
#      malformed frame is logged and reported back over the socket, but
#      does not end the connection — only a genuine disconnect (either
#      side) does.
#
# The model (loaded once at process startup — see predictor.py and
# main.py's lifespan) lives entirely behind predictor.predict(); this
# file still does no preprocessing or ML of its own, same as before.
# ===========================================================================

import asyncio
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.auth import verify_token
from app.predictor import predictor
from app.protocol import ChunkDecodeError, decode_chunk_frame
from app.schemas import AuthMessage

logger = logging.getLogger("detection.ws")

router = APIRouter()

_AUTH_TIMEOUT_SECONDS = 10.0


@router.websocket("/ws/detect")
async def detection_socket(websocket: WebSocket) -> None:
    await websocket.accept()

    if not await _authenticate(websocket):
        return  # _authenticate has already closed the socket with a reason

    logger.info("Detection socket authenticated — streaming chunks")

    # Tracks the last chunk sequence number seen, purely to notice (and
    # log) a gap — e.g. from a client reconnect that reset its own
    # counter. Not enforced; a gap is informational, never rejected.
    last_sequence: int | None = None

    try:
        while True:
            message = await websocket.receive()

            if message.get("type") == "websocket.disconnect":
                break

            frame = message.get("bytes")
            if frame is None:
                # A text/JSON message arrived where a binary chunk frame
                # was expected. Not fatal for the connection — just note
                # it and keep listening.
                logger.debug(
                    "Ignoring non-binary message on an authenticated detection socket: %r",
                    message.get("text"),
                )
                continue

            start = time.perf_counter()

            try:
                decoded = decode_chunk_frame(frame)
            except ChunkDecodeError as exc:
                logger.warning("Failed to decode chunk frame: %s", exc)
                await websocket.send_json({"type": "error", "reason": str(exc)})
                continue

            sequence = decoded.header.get("sequence")
            if isinstance(sequence, int):
                if last_sequence is not None and sequence != last_sequence + 1:
                    logger.info(
                        "Chunk sequence gap (expected %s, got %s) — likely a reconnect",
                        last_sequence + 1,
                        sequence,
                    )
                last_sequence = sequence

            verdict = predictor.predict(decoded)
            # predictor.predict() times only its own internals; override
            # with the full decode+inference span this route already
            # measures, so processing_time_ms keeps meaning exactly what
            # its docstring in schemas.py says it means -- genuinely
            # measured end-to-end time for this chunk, not just one part
            # of it.
            processing_time_ms = (time.perf_counter() - start) * 1000
            verdict.processing_time_ms = round(processing_time_ms, 1)

            await websocket.send_json(verdict.model_dump())

    except WebSocketDisconnect:
        logger.info("Detection socket disconnected")
    except Exception:
        # Belt-and-suspenders: any unexpected error tears down this one
        # connection, not the whole server process.
        logger.exception("Unexpected error on detection socket")


async def _authenticate(websocket: WebSocket) -> bool:
    """
    Waits for the client's auth message and replies auth_ack/auth_error.
    Returns True if the caller should proceed into the chunk loop, False
    if the socket has already been closed (auth missing/malformed/timed
    out/rejected).
    """
    try:
        raw = await asyncio.wait_for(websocket.receive_json(), timeout=_AUTH_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        logger.info("Detection socket closed: no auth message within %ss", _AUTH_TIMEOUT_SECONDS)
        await websocket.close(code=4001, reason="Auth timeout")
        return False
    except Exception:
        logger.info("Detection socket closed: expected a JSON auth message first")
        await websocket.close(code=4000, reason="Expected auth message")
        return False

    try:
        auth_message = AuthMessage.model_validate(raw)
    except ValidationError:
        await websocket.send_json({"type": "auth_error", "reason": "Malformed auth message"})
        await websocket.close(code=4002)
        return False

    user = verify_token(auth_message.token)
    if user is None:
        await websocket.send_json({"type": "auth_error", "reason": "Invalid or missing token"})
        await websocket.close(code=4003)
        return False

    await websocket.send_json({"type": "auth_ack"})
    return True
