# ===========================================================================
# auth.py — authentication for the detection WebSocket.
#
# This implements the server side of the handshake the frontend's
# DetectionTransport already speaks (see
# frontend/src/services/detectionTransport.ts, handleOpen()): the client
# sends `{"type": "auth", "token": "..."}` as its first message right after
# the socket opens, and this module decides whether that token is
# acceptable.
#
# This is real verification, not a stub — it checks the exact same JWT the
# Node backend issues (see backend/src/utils/token.js's
# generateAccessToken: HS256, { id, email } payload, issuer
# "ringwave-api"), using a JWT_SECRET shared between the two services via
# environment variables. No new credential type is introduced.
#
# If JWT_SECRET isn't configured, this falls back to accepting any
# non-empty token, so the service can be started and poked at on its own
# without also standing up the full Node backend. That fallback logs a
# warning every time it's used and must never be relied on in production —
# see config.py's docstring on the same setting.
# ===========================================================================

import logging
from typing import Optional, TypedDict

import jwt

from app.config import settings

logger = logging.getLogger("detection.auth")


class AuthenticatedUser(TypedDict):
    id: object
    email: Optional[str]


def verify_token(token: Optional[str]) -> Optional[AuthenticatedUser]:
    """
    Returns the decoded user payload if `token` is acceptable, or None if
    it should be rejected. Never raises — callers only need to check for
    None, matching the "never let auth failures crash the connection
    handler" posture used throughout this service.
    """
    if not token:
        return None

    if not settings.jwt_secret:
        logger.warning(
            "JWT_SECRET is not configured — accepting token without verification. "
            "This is a development-only fallback; set JWT_SECRET (matching the "
            "Node backend's) before running this service against real traffic."
        )
        return {"id": "unverified", "email": None}

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            issuer=settings.jwt_issuer,
            options={"require": ["exp"]},
        )
    except jwt.PyJWTError as exc:
        logger.info("Rejected detection socket auth: %s", exc)
        return None

    return {"id": payload.get("id"), "email": payload.get("email")}
