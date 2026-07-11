"""terminal.render integration: daemon output path and subscribe snapshot."""

import asyncio

import pytest

from cucoudle_desktop.registry import SessionRegistry
from cucoudle_desktop.render import TerminalRenderer


def make_entry(registry: SessionRegistry):
    entry = registry.create(tool="claude", command="claude", argv=[], cwd="/tmp")
    entry.renderer = TerminalRenderer(cols=40, rows=5)
    return entry


def test_subscribe_view_includes_render_snapshot():
    registry = SessionRegistry()
    entry = make_entry(registry)
    entry.renderer.feed(b"\x1b[32mok\x1b[0m")
    seq = registry.record_output(entry.session.id, "\x1b[32mok\x1b[0m")
    view = registry.subscribe_view(entry.session.id, None)
    assert view["mode"] == "snapshot"
    assert seq is not None
    render = view["terminalRender"]
    assert render["screen"][0][0] == {"t": "ok", "fg": "green"}
    assert render["history"] == []


def test_subscribe_view_live_mode_still_has_render():
    registry = SessionRegistry()
    entry = make_entry(registry)
    view = registry.subscribe_view(entry.session.id, None)
    assert view["mode"] == "live"
    assert "terminalRender" in view


@pytest.mark.asyncio
async def test_daemon_emits_coalesced_render_frame(monkeypatch, tmp_path):
    from cucoudle_desktop.config import Config
    from cucoudle_desktop.daemon import Daemon

    cfg = Config(
        desktop_id="desk_test",
        desktop_name="test",
        platform="linux",
        app_version="0.1.0",
        relay_url="ws://localhost:59999",
        home=tmp_path,
    )
    daemon = Daemon(cfg)
    entry = make_entry(daemon.registry)
    sid = entry.session.id
    daemon._decoders[sid] = __import__("codecs").getincrementaldecoder("utf-8")("replace")

    emitted: list[tuple[str, dict]] = []
    monkeypatch.setattr(daemon, "_emit", lambda event, data: emitted.append((event, data)))

    # Two rapid chunks must coalesce into a single render frame.
    daemon._on_output(sid, b"\x1b[31mhello\x1b[0m")
    daemon._on_output(sid, b" world")
    await asyncio.sleep(0.1)

    render_events = [d for (e, d) in emitted if e == "terminal.render"]
    assert len(render_events) == 1
    frame = render_events[0]
    assert frame["sessionId"] == sid
    assert frame["seq"] == 1
    line = frame["screen"][0]
    assert line[0] == {"t": "hello", "fg": "red"}
    assert line[1]["t"] == " world"
    # raw stream is still emitted alongside
    assert [e for (e, _) in emitted].count("terminal.output") == 2


def test_renderer_failure_cannot_break_raw_pty_output(monkeypatch, tmp_path):
    from cucoudle_desktop.config import Config
    from cucoudle_desktop.daemon import Daemon

    cfg = Config(
        desktop_id="desk_test",
        desktop_name="test",
        platform="linux",
        app_version="0.1.0",
        relay_url="ws://localhost:59999",
        home=tmp_path,
    )
    daemon = Daemon(cfg)
    entry = make_entry(daemon.registry)
    sid = entry.session.id
    daemon._decoders[sid] = __import__("codecs").getincrementaldecoder("utf-8")("replace")
    emitted: list[tuple[str, dict]] = []
    logged: list[str] = []
    monkeypatch.setattr(daemon, "_emit", lambda event, data: emitted.append((event, data)))
    monkeypatch.setattr(daemon, "log", logged.append)
    monkeypatch.setattr(entry.renderer, "feed", lambda _data: (_ for _ in ()).throw(TypeError("bad CSI")))

    daemon._on_output(sid, b"still visible")

    assert ("terminal.output", {"sessionId": sid, "seq": 1, "data": "still visible"}) in emitted
    assert entry.renderer is None
    assert logged == [f"terminal renderer disabled sid={sid}: TypeError: bad CSI"]
