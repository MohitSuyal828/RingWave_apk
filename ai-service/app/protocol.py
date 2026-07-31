# ===========================================================================
# protocol.py — decodes the binary chunk frames produced by the frontend's
# detectionProtocol.ts.
#
# This is structural decoding only: turn wire bytes into a header dict plus
# raw float32 samples. It does NOT resample, normalize, trim silence, or do
# anything else that would count as audio preprocessing — that is
# explicitly out of scope for this milestone (and belongs, later, right
# next to whatever model consumes it, once one exists).
#
# Wire format — MUST match frontend/src/services/detectionProtocol.ts
# exactly, since that file is the only producer of these frames:
#
#     [ 4 bytes ] header length, little-endian uint32
#     [ N bytes ] header, UTF-8 JSON
#     [ M bytes ] raw PCM samples, 32-bit float, little-endian, mono
# ===========================================================================

import json
import struct
import sys
from array import array
from dataclasses import dataclass
from typing import Any


class ChunkDecodeError(ValueError):
    """Raised when a received frame doesn't match the expected wire format.
    Callers (the WebSocket route) treat this as a per-chunk problem, not a
    reason to drop the whole connection."""


@dataclass
class DecodedChunk:
    header: dict[str, Any]
    sample_count: int
    # array('f', ...) of native-endian float32 samples. Kept as a stdlib
    # `array` rather than converting to a numpy array here — this service
    # doesn't need numeric operations on the samples yet (see file header:
    # no preprocessing at this milestone), so there's no reason to take on
    # that dependency before something actually needs it.
    samples: "array[float]"


_HEADER_LENGTH_PREFIX_SIZE = 4  # bytes — matches the frontend's uint32 prefix


def decode_chunk_frame(frame: bytes) -> DecodedChunk:
    """Parses one binary WebSocket frame into its header + PCM samples.
    Raises ChunkDecodeError on any structural mismatch."""

    if len(frame) < _HEADER_LENGTH_PREFIX_SIZE:
        raise ChunkDecodeError(
            f"Frame ({len(frame)} bytes) is smaller than the {_HEADER_LENGTH_PREFIX_SIZE}-byte length prefix"
        )

    (header_length,) = struct.unpack_from("<I", frame, 0)  # "<I" = little-endian uint32

    header_start = _HEADER_LENGTH_PREFIX_SIZE
    header_end = header_start + header_length

    if header_end > len(frame):
        raise ChunkDecodeError(
            f"Declared header length ({header_length}) exceeds remaining frame size"
        )

    try:
        header = json.loads(frame[header_start:header_end].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ChunkDecodeError(f"Invalid header JSON: {exc}") from exc

    if not isinstance(header, dict):
        raise ChunkDecodeError("Header did not decode to a JSON object")

    pcm_bytes = frame[header_end:]

    if len(pcm_bytes) % 4 != 0:
        raise ChunkDecodeError(
            f"PCM payload ({len(pcm_bytes)} bytes) is not a whole number of float32 samples"
        )

    samples = array("f")
    samples.frombytes(pcm_bytes)

    # The wire format is explicitly little-endian ("encoding": "float32le"
    # in the header). `array` uses native byte order when reading raw
    # bytes, so on the rare big-endian host this needs a byteswap for
    # correctness — a no-op on every little-endian platform this service
    # actually targets.
    if sys.byteorder == "big":
        samples.byteswap()

    declared_count = header.get("sampleCount")
    if declared_count is not None and declared_count != len(samples):
        raise ChunkDecodeError(
            f"Header declares {declared_count} samples but payload contains {len(samples)}"
        )

    return DecodedChunk(header=header, sample_count=len(samples), samples=samples)
