"""Composer text delivery: bracketed paste + discrete Enter for both
session.input and interaction.respond text replies."""

import asyncio

import pytest

from cucoudle_desktop.config import Config
from cucoudle_desktop.daemon import Daemon
from cucoudle_desktop.protocol import InteractionKind, InteractionRequest


class FakePty:
    def __init__(self):
        self.writes: list[bytes] = []
        self.running = True

    def write(self, payload: bytes) -> None:
        self.writes.append(payload)


def make_daemon(tmp_path) -> Daemon:
    cfg = Config(
        desktop_id="desk_test",
        desktop_name="test",
        platform="linux",
        app_version="0.1.0",
        relay_url="ws://localhost:59999",
        home=tmp_path,
    )
    return Daemon(cfg)


def make_session(daemon: Daemon):
    entry = daemon.registry.create(tool="codex", command="codex", argv=[], cwd="/tmp")
    entry.pty = FakePty()
    daemon.registry.mark_running(entry.session.id)
    return entry


@pytest.mark.asyncio
async def test_session_input_uses_paste_and_delayed_enter(monkeypatch, tmp_path):
    daemon = make_daemon(tmp_path)
    monkeypatch.setattr(daemon, "_emit", lambda *_: None)
    entry = make_session(daemon)
    sid = entry.session.id
    daemon._bracketed_paste = {sid: True}

    result = daemon.handle_relay_request(
        "session.input",
        {"sessionId": sid, "inputMode": "text", "data": "hello", "submit": True},
    )
    assert result == {"accepted": True}
    assert entry.pty.writes == [b"\x1b[200~hello\x1b[201~"]
    await asyncio.sleep(0.1)  # Enter arrives as a separate, later keypress
    assert entry.pty.writes == [b"\x1b[200~hello\x1b[201~", b"\r"]


@pytest.mark.asyncio
async def test_interaction_text_reply_uses_same_delivery(monkeypatch, tmp_path):
    daemon = make_daemon(tmp_path)
    monkeypatch.setattr(daemon, "_emit", lambda *_: None)
    entry = make_session(daemon)
    sid = entry.session.id
    daemon._bracketed_paste = {sid: True}
    entry.active_interaction = InteractionRequest(
        id="int_test",
        sessionId=sid,
        kind=InteractionKind.TEXT,
        prompt="What next?",
        allowsText=True,
        createdAt="2026-07-11T00:00:00Z",
    )
    entry.known_interaction_ids.add("int_test")

    result = daemon.handle_relay_request(
        "interaction.respond",
        {
            "sessionId": sid,
            "interactionId": "int_test",
            "response": {"type": "text", "text": "do the thing", "submit": True},
        },
    )
    assert result == {"accepted": True}
    assert entry.active_interaction is None
    assert entry.pty.writes == [b"\x1b[200~do the thing\x1b[201~"]
    await asyncio.sleep(0.1)
    assert entry.pty.writes == [b"\x1b[200~do the thing\x1b[201~", b"\r"]


@pytest.mark.asyncio
async def test_text_without_bracketed_paste_is_plain(monkeypatch, tmp_path):
    daemon = make_daemon(tmp_path)
    monkeypatch.setattr(daemon, "_emit", lambda *_: None)
    entry = make_session(daemon)
    sid = entry.session.id

    daemon.handle_relay_request(
        "session.input",
        {"sessionId": sid, "inputMode": "text", "data": "ls", "submit": True},
    )
    assert entry.pty.writes == [b"ls"]
    await asyncio.sleep(0.1)
    assert entry.pty.writes == [b"ls", b"\r"]
