"""Local session registry and terminal output buffering.

The desktop daemon is the source of truth for sessions. The registry tracks
:class:`Session` metadata, the live :class:`GenericPtySession`, and a bounded
buffer of recent terminal output used to satisfy ``session.subscribe`` replay
and snapshot modes from ``docs/protocol-contracts.md``.

``seq`` is a single monotonic counter per daemon (per relay connection), as the
contract specifies, shared across all sessions.
"""

from __future__ import annotations

import secrets
from collections import deque
from dataclasses import dataclass, field
from typing import Optional

from .protocol import (
    AgentKind,
    InteractionRequest,
    Session,
    SessionStatus,
    classify_agent,
    now_iso,
)
from .render import TerminalRenderer
from .session import GenericPtySession

# Per-session replay budget. Enough to reconstruct a screenful+ on reconnect
# without holding the entire transcript in memory.
MAX_BUFFER_BYTES = 256 * 1024
MAX_BUFFER_CHUNKS = 2000


@dataclass
class OutputChunk:
    seq: int
    data: str


@dataclass
class SessionEntry:
    session: Session
    pty: GenericPtySession | None = None
    renderer: TerminalRenderer | None = None
    buffer: deque[OutputChunk] = field(default_factory=deque)
    buffered_bytes: int = 0
    # Structured-interaction state (see interactions.py / daemon lifecycle).
    active_interaction: Optional[InteractionRequest] = None
    interaction_bytes: dict[str, bytes] = field(default_factory=dict)
    interaction_signature: Optional[tuple] = None
    interaction_seq: Optional[int] = None
    known_interaction_ids: set[str] = field(default_factory=set)

    def append_output(self, seq: int, data: str) -> None:
        self.buffer.append(OutputChunk(seq, data))
        self.buffered_bytes += len(data)
        while self.buffer and (
            self.buffered_bytes > MAX_BUFFER_BYTES
            or len(self.buffer) > MAX_BUFFER_CHUNKS
        ):
            dropped = self.buffer.popleft()
            self.buffered_bytes -= len(dropped.data)

    @property
    def earliest_seq(self) -> Optional[int]:
        return self.buffer[0].seq if self.buffer else None

    @property
    def last_seq(self) -> Optional[int]:
        return self.buffer[-1].seq if self.buffer else None


def new_session_id() -> str:
    return "sess_" + secrets.token_hex(6)


def _title_for(agent: AgentKind, command: str, cwd: str) -> str:
    import os

    folder = os.path.basename(cwd.rstrip("/")) or cwd or "~"
    label = {
        AgentKind.CLAUDE: "Claude",
        AgentKind.CODEX: "Codex",
        AgentKind.CURSOR: "Cursor",
        AgentKind.SHELL: "Shell",
    }.get(agent, command or "session")
    return f"{label} · {folder}"


class SessionRegistry:
    """In-memory registry of active and recently-ended sessions."""

    def __init__(self) -> None:
        self._entries: dict[str, SessionEntry] = {}
        self._seq = 0

    # ---- seq -----------------------------------------------------------
    def next_seq(self) -> int:
        self._seq += 1
        return self._seq

    @property
    def current_seq(self) -> int:
        return self._seq

    # ---- lifecycle -----------------------------------------------------
    def create(self, tool: str, command: str, argv: list[str], cwd: str) -> SessionEntry:
        agent = classify_agent(tool)
        ts = now_iso()
        session = Session(
            id=new_session_id(),
            agent=agent,
            title=_title_for(agent, command, cwd),
            command=command,
            argv=argv,
            cwd=cwd,
            status=SessionStatus.STARTING,
            createdAt=ts,
            lastActivityAt=ts,
        )
        entry = SessionEntry(session=session)
        self._entries[session.id] = entry
        return entry

    def get(self, session_id: str) -> SessionEntry | None:
        return self._entries.get(session_id)

    def remove(self, session_id: str) -> None:
        self._entries.pop(session_id, None)

    def all(self) -> list[SessionEntry]:
        return list(self._entries.values())

    def sessions(self) -> list[Session]:
        return [e.session for e in self._entries.values()]

    # ---- mutations -----------------------------------------------------
    def record_output(self, session_id: str, data: str) -> int | None:
        entry = self._entries.get(session_id)
        if entry is None:
            return None
        seq = self.next_seq()
        entry.append_output(seq, data)
        entry.session.lastActivityAt = now_iso()
        if entry.session.status == SessionStatus.STARTING:
            entry.session.status = SessionStatus.RUNNING.value
        return seq

    def mark_running(self, session_id: str) -> None:
        entry = self._entries.get(session_id)
        if entry:
            entry.session.status = SessionStatus.RUNNING.value
            entry.session.lastActivityAt = now_iso()

    def mark_waiting(self, session_id: str) -> None:
        entry = self._entries.get(session_id)
        if entry:
            entry.session.status = SessionStatus.WAITING.value
            entry.session.lastActivityAt = now_iso()

    def output_tail(self, session_id: str, max_chars: int = 4000) -> str | None:
        """Recent decoded output for prompt detection, or ``None`` if empty."""
        entry = self._entries.get(session_id)
        if entry is None or not entry.buffer:
            return None
        text = "".join(c.data for c in entry.buffer)
        return text[-max_chars:]

    def mark_ended(self, session_id: str, exit_code: int | None) -> None:
        entry = self._entries.get(session_id)
        if entry:
            entry.session.status = SessionStatus.STOPPED.value
            entry.session.exitCode = exit_code
            entry.session.lastActivityAt = now_iso()

    # ---- replay / snapshot ---------------------------------------------
    def subscribe_view(self, session_id: str, after_seq: int | None) -> dict | None:
        """Build the ``session.subscribe`` result body for a session.

        Returns a dict with ``session``, ``mode`` and the mode-specific payload,
        or ``None`` if the session is unknown.
        """
        entry = self._entries.get(session_id)
        if entry is None:
            return None
        session_dict = entry.session.model_dump(exclude_none=True)
        last = entry.last_seq

        view: dict
        if after_seq is None:
            # Fresh open: hand over whatever we have as a snapshot.
            if not entry.buffer:
                view = {"session": session_dict, "mode": "live"}
            else:
                buffer_text = "".join(c.data for c in entry.buffer)
                view = {
                    "session": session_dict,
                    "mode": "snapshot",
                    "terminalBuffer": buffer_text,
                    "lastSeq": last,
                }
        else:
            earliest = entry.earliest_seq
            if last is None or after_seq >= last:
                view = {"session": session_dict, "mode": "live"}
            elif earliest is not None and after_seq >= earliest - 1:
                events = [
                    {"sessionId": session_id, "seq": c.seq, "data": c.data}
                    for c in entry.buffer
                    if c.seq > after_seq
                ]
                view = {"session": session_dict, "mode": "replay", "events": events}
            else:
                # Missed the buffer window: fall back to a snapshot.
                buffer_text = "".join(c.data for c in entry.buffer)
                view = {
                    "session": session_dict,
                    "mode": "snapshot",
                    "terminalBuffer": buffer_text,
                    "lastSeq": last,
                }
        if entry.active_interaction is not None:
            view["activeInteraction"] = entry.active_interaction.model_dump(exclude_none=True)
        if entry.renderer is not None:
            view["terminalRender"] = entry.renderer.snapshot()
        return view
