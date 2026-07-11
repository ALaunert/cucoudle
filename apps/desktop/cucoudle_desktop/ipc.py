"""Framing for the local Unix-socket channel between shims/CLI and the daemon.

The terminal bridge carries arbitrary raw PTY bytes, so a line- or JSON-only
protocol will not do. Every frame is::

    +--------+------------------+-----------------+
    | type   | length (uint32)  | payload         |
    | 1 byte | 4 bytes, big-end | ``length`` bytes|
    +--------+------------------+-----------------+

Control payloads (HELLO, RESIZE, EXIT, ...) are UTF-8 JSON. STDIN/STDOUT
payloads are raw bytes.

The shim intentionally re-implements this tiny reader/writer with only the
standard library (see ``shim_template.py``) to keep shim startup fast; keep the
two in sync.
"""

from __future__ import annotations

import json
import struct
from dataclasses import dataclass

_HEADER = struct.Struct(">BI")  # type: 1 byte, length: 4 bytes
MAX_FRAME = 8 * 1024 * 1024  # 8 MiB guard against runaway frames

# shim / CLI -> daemon
HELLO = 0x01           # json: {tool, argv, cwd, env, cols, rows}
STDIN = 0x02           # raw bytes from the local terminal
RESIZE = 0x03          # json: {cols, rows}
STDIN_EOF = 0x04       # empty: local stdin closed
CONTROL_REQUEST = 0x10  # json: {method, params}

# daemon -> shim / CLI
READY = 0x81           # json: {sessionId}
STDOUT = 0x82          # raw PTY output bytes
EXIT = 0x83            # json: {exitCode}
ERROR = 0x84           # json: {code, message}
CONTROL_RESPONSE = 0x90  # json: {ok, result?, error?}


@dataclass
class Frame:
    type: int
    payload: bytes

    def json(self) -> dict:
        return json.loads(self.payload.decode("utf-8")) if self.payload else {}


def encode(frame_type: int, payload: bytes = b"") -> bytes:
    if len(payload) > MAX_FRAME:
        raise ValueError(f"frame payload too large: {len(payload)} bytes")
    return _HEADER.pack(frame_type, len(payload)) + payload


def encode_json(frame_type: int, obj: dict) -> bytes:
    return encode(frame_type, json.dumps(obj).encode("utf-8"))


class FrameDecoder:
    """Incremental decoder that turns a byte stream into frames."""

    def __init__(self) -> None:
        self._buf = bytearray()

    def feed(self, data: bytes) -> list[Frame]:
        self._buf.extend(data)
        frames: list[Frame] = []
        while True:
            if len(self._buf) < _HEADER.size:
                break
            frame_type, length = _HEADER.unpack_from(self._buf, 0)
            if length > MAX_FRAME:
                raise ValueError(f"frame length exceeds limit: {length}")
            total = _HEADER.size + length
            if len(self._buf) < total:
                break
            payload = bytes(self._buf[_HEADER.size:total])
            del self._buf[:total]
            frames.append(Frame(frame_type, payload))
        return frames


async def read_frame(reader) -> Frame | None:
    """Read exactly one frame from an ``asyncio.StreamReader``.

    Returns ``None`` on clean EOF.
    """
    try:
        header = await reader.readexactly(_HEADER.size)
    except Exception:
        return None
    frame_type, length = _HEADER.unpack(header)
    if length > MAX_FRAME:
        raise ValueError(f"frame length exceeds limit: {length}")
    payload = await reader.readexactly(length) if length else b""
    return Frame(frame_type, payload)
