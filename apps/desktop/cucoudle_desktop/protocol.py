"""Wire protocol models mirroring ``docs/protocol-contracts.md``.

The backend owns the canonical TypeScript schemas; this module is the Python
mirror used by the desktop daemon. Field names match the wire format exactly
(camelCase) so payloads round-trip without translation.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

PROTOCOL_VERSION = "2026-07-11"


def now_iso() -> str:
    """Current time as ISO 8601 UTC with a trailing ``Z``."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


class ProtocolException(Exception):
    """Raised by request handlers to produce a structured error response.

    ``code`` is an :class:`ErrorCode` value for relay-facing responses; the
    internal control channel may use any short string code.
    """

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details


class ErrorCode(str, Enum):
    INVALID_MESSAGE = "INVALID_MESSAGE"
    UNSUPPORTED_PROTOCOL = "UNSUPPORTED_PROTOCOL"
    UNSUPPORTED_METHOD = "UNSUPPORTED_METHOD"
    UNAUTHORIZED = "UNAUTHORIZED"
    PAIRING_EXPIRED = "PAIRING_EXPIRED"
    PAIRING_NOT_FOUND = "PAIRING_NOT_FOUND"
    DESKTOP_OFFLINE = "DESKTOP_OFFLINE"
    MOBILE_NOT_PAIRED = "MOBILE_NOT_PAIRED"
    SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
    SESSION_STOPPED = "SESSION_STOPPED"
    TOOL_NOT_FOUND = "TOOL_NOT_FOUND"
    DAEMON_UNAVAILABLE = "DAEMON_UNAVAILABLE"
    PTY_WRITE_FAILED = "PTY_WRITE_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


class SessionStatus(str, Enum):
    STARTING = "starting"
    RUNNING = "running"
    WAITING = "waiting"
    STOPPED = "stopped"
    ERROR = "error"


class AgentKind(str, Enum):
    CLAUDE = "claude"
    CODEX = "codex"
    CURSOR = "cursor"
    SHELL = "shell"
    UNKNOWN = "unknown"


class Session(BaseModel):
    model_config = ConfigDict(use_enum_values=True)

    id: str
    agent: AgentKind
    title: str
    command: str
    argv: list[str] = Field(default_factory=list)
    cwd: str
    status: SessionStatus
    createdAt: str
    lastActivityAt: str
    exitCode: Optional[int] = None


class ProtocolError(BaseModel):
    code: ErrorCode
    message: str
    details: Optional[dict[str, Any]] = None


class RequestMessage(BaseModel):
    version: str = PROTOCOL_VERSION
    kind: Literal["request"] = "request"
    id: str
    method: str
    params: dict[str, Any] = Field(default_factory=dict)
    sentAt: str = Field(default_factory=now_iso)


class ResponseMessage(BaseModel):
    version: str = PROTOCOL_VERSION
    kind: Literal["response"] = "response"
    id: str
    ok: bool
    result: Optional[dict[str, Any]] = None
    error: Optional[ProtocolError] = None
    sentAt: str = Field(default_factory=now_iso)


class EventMessage(BaseModel):
    version: str = PROTOCOL_VERSION
    kind: Literal["event"] = "event"
    event: str
    data: dict[str, Any] = Field(default_factory=dict)
    sentAt: str = Field(default_factory=now_iso)


# ---- envelope helpers --------------------------------------------------

def make_request(method: str, params: dict[str, Any], request_id: str) -> RequestMessage:
    return RequestMessage(id=request_id, method=method, params=params)


def make_response(request_id: str, result: dict[str, Any]) -> ResponseMessage:
    return ResponseMessage(id=request_id, ok=True, result=result)


def make_error(request_id: str, code: ErrorCode, message: str,
               details: dict[str, Any] | None = None) -> ResponseMessage:
    return ResponseMessage(
        id=request_id,
        ok=False,
        error=ProtocolError(code=code, message=message, details=details),
    )


def make_event(event: str, data: dict[str, Any]) -> EventMessage:
    return EventMessage(event=event, data=data)


def parse_envelope(raw: str | bytes) -> RequestMessage | ResponseMessage | EventMessage:
    """Parse a wire message into the correct envelope type.

    Raises ``ValueError`` for structurally invalid input so callers can map it
    to an ``INVALID_MESSAGE`` protocol error.
    """
    import json

    try:
        data = json.loads(raw)
    except (ValueError, TypeError) as exc:  # pragma: no cover - defensive
        raise ValueError(f"invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("envelope must be a JSON object")
    kind = data.get("kind")
    if kind == "request":
        return RequestMessage.model_validate(data)
    if kind == "response":
        return ResponseMessage.model_validate(data)
    if kind == "event":
        return EventMessage.model_validate(data)
    raise ValueError(f"unknown envelope kind: {kind!r}")


def dump(message: BaseModel) -> str:
    """Serialize an envelope to a compact JSON string for the wire."""
    return message.model_dump_json(exclude_none=True)


def classify_agent(tool: str) -> AgentKind:
    """Map an invoked command name to an :class:`AgentKind`."""
    tool = tool.lower()
    if tool == "claude":
        return AgentKind.CLAUDE
    if tool == "codex":
        return AgentKind.CODEX
    if tool in ("cursor", "agent"):
        return AgentKind.CURSOR
    if tool in ("bash", "sh", "zsh", "fish", "shell"):
        return AgentKind.SHELL
    return AgentKind.UNKNOWN
