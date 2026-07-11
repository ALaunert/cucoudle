import asyncio
import shutil
import tempfile
from pathlib import Path
from unittest.mock import Mock, call

import pytest

from cucoudle_desktop import ipc
from cucoudle_desktop.config import Config
from cucoudle_desktop.daemon import Daemon, DaemonAlreadyRunning
from cucoudle_desktop.protocol import ErrorCode, ProtocolException


@pytest.fixture
def short_home():
    # AF_UNIX paths are capped (~104 chars on macOS); pytest's tmp_path is too
    # long once we append the socket name, so use a short /tmp dir here.
    path = Path(tempfile.mkdtemp(prefix="cuc", dir="/tmp"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def _cfg(home, real=None):
    cfg = Config(
        desktop_id="desk_test",
        desktop_name="test",
        platform="linux",
        app_version="0.1.0",
        relay_url="ws://localhost:59999",  # nothing there; relay stays disconnected
        home=Path(home),
    )
    cfg.real_binaries = real or {}
    cfg.home.mkdir(parents=True, exist_ok=True)
    return cfg


async def _serve(daemon: Daemon):
    return await asyncio.start_unix_server(daemon._handle_conn, path=str(daemon.cfg.socket_path))


async def _hello(writer, tool, argv):
    writer.write(ipc.encode_json(ipc.HELLO, {
        "tool": tool, "argv": argv, "cwd": "/tmp", "env": {}, "cols": 80, "rows": 24,
    }))
    await writer.drain()


@pytest.mark.asyncio
async def test_bridge_streams_output_and_exit(short_home):
    cfg = _cfg(short_home, {"sh": "/bin/sh"})
    daemon = Daemon(cfg)
    server = await _serve(daemon)
    async with server:
        reader, writer = await asyncio.open_unix_connection(path=str(cfg.socket_path))
        await _hello(writer, "sh", ["-c", "echo bridged-out; exit 0"])

        collected = bytearray()
        exit_code = None
        session_id = None
        while True:
            frame = await asyncio.wait_for(ipc.read_frame(reader), 10)
            if frame is None:
                break
            if frame.type == ipc.READY:
                session_id = frame.json()["sessionId"]
            elif frame.type == ipc.STDOUT:
                collected.extend(frame.payload)
            elif frame.type == ipc.EXIT:
                exit_code = frame.json()["exitCode"]
                break

        assert session_id and session_id.startswith("sess_")
        assert b"bridged-out" in bytes(collected)
        assert exit_code == 0

        listing = daemon.handle_relay_request("session.list", {})
        assert any(s["id"] == session_id for s in listing["sessions"])
        writer.close()


@pytest.mark.asyncio
async def test_remote_input_and_interrupt(short_home):
    cfg = _cfg(short_home, {"cat": "/bin/cat"})
    daemon = Daemon(cfg)
    server = await _serve(daemon)
    async with server:
        reader, writer = await asyncio.open_unix_connection(path=str(cfg.socket_path))
        await _hello(writer, "cat", [])

        ready = await asyncio.wait_for(ipc.read_frame(reader), 5)
        assert ready.type == ipc.READY
        sid = ready.json()["sessionId"]

        # Simulate a mobile client sending input through the relay path.
        result = daemon.handle_relay_request("session.input", {"sessionId": sid, "data": "remote-typed\n"})
        assert result == {"accepted": True}

        seen = bytearray()
        while b"remote-typed" not in bytes(seen):
            frame = await asyncio.wait_for(ipc.read_frame(reader), 5)
            if frame.type == ipc.STDOUT:
                seen.extend(frame.payload)

        # Mobile interrupt ends the session.
        daemon.handle_relay_request("session.interrupt", {"sessionId": sid})
        exit_code = None
        while exit_code is None:
            frame = await asyncio.wait_for(ipc.read_frame(reader), 5)
            if frame is None:
                break
            if frame.type == ipc.EXIT:
                exit_code = frame.json()["exitCode"]
        assert exit_code != 0  # terminated by signal
        writer.close()


def test_submitted_text_writes_body_then_enter(tmp_path):
    daemon = Daemon(_cfg(tmp_path))
    entry = daemon.registry.create("codex", "codex", [], "/tmp")
    entry.pty = Mock(running=True)

    result = daemon.handle_relay_request("session.input", {
        "sessionId": entry.session.id,
        "inputMode": "text",
        "data": "continue",
        "submit": True,
    })

    # Enter is a SEPARATE keypress so a bracketed-paste TUI actually submits it.
    assert entry.pty.write.call_args_list == [call(b"continue"), call(b"\r")]
    assert result == {"accepted": True}


def test_submitted_legacy_newline_becomes_discrete_enter(tmp_path):
    daemon = Daemon(_cfg(tmp_path))
    entry = daemon.registry.create("codex", "codex", [], "/tmp")
    entry.pty = Mock(running=True)

    daemon.handle_relay_request("session.input", {
        "sessionId": entry.session.id,
        "inputMode": "text",
        "data": "continue\n",
        "submit": True,
    })

    assert entry.pty.write.call_args_list == [call(b"continue"), call(b"\r")]


def test_submit_wraps_text_as_paste_when_bracketed_paste_enabled(tmp_path):
    daemon = Daemon(_cfg(tmp_path))
    entry = daemon.registry.create("codex", "codex", [], "/tmp")
    entry.pty = Mock(running=True)
    daemon._bracketed_paste = {entry.session.id: True}

    daemon.handle_relay_request("session.input", {
        "sessionId": entry.session.id,
        "inputMode": "text",
        "data": "hello world",
        "submit": True,
    })

    assert entry.pty.write.call_args_list == [
        call(b"\x1b[200~hello world\x1b[201~"),
        call(b"\r"),
    ]


@pytest.mark.asyncio
async def test_unknown_tool_returns_error_frame(short_home):
    cfg = _cfg(short_home, {})  # no real binaries; a nonsense tool won't resolve
    daemon = Daemon(cfg)
    server = await _serve(daemon)
    async with server:
        reader, writer = await asyncio.open_unix_connection(path=str(cfg.socket_path))
        await _hello(writer, "definitely-not-a-real-tool-xyz", [])
        frame = await asyncio.wait_for(ipc.read_frame(reader), 5)
        assert frame.type == ipc.ERROR
        assert frame.json()["code"] == ErrorCode.TOOL_NOT_FOUND.value
        writer.close()


@pytest.mark.asyncio
async def test_second_daemon_refuses_when_one_is_live(short_home):
    cfg = _cfg(short_home, {})
    live = Daemon(cfg)
    server = await _serve(live)  # a live daemon holding the control socket
    async with server:
        other = Daemon(cfg)
        assert other._existing_daemon_alive() is True
        with pytest.raises(DaemonAlreadyRunning):
            await other.run()
        # refusing must NOT remove the live daemon's socket
        assert cfg.socket_path.exists()


@pytest.mark.asyncio
async def test_daemon_alive_check_false_for_absent_socket(short_home):
    cfg = _cfg(short_home, {})
    daemon = Daemon(cfg)
    assert daemon._existing_daemon_alive() is False  # nothing bound yet


def test_handle_relay_request_errors(tmp_path):
    daemon = Daemon(_cfg(tmp_path))
    # Unknown session
    with pytest.raises(ProtocolException) as exc:
        daemon.handle_relay_request("session.subscribe", {"sessionId": "sess_missing"})
    assert exc.value.code == ErrorCode.SESSION_NOT_FOUND

    # Session with no live pty -> stopped
    entry = daemon.registry.create("claude", "claude", [], "/tmp")
    with pytest.raises(ProtocolException) as exc2:
        daemon.handle_relay_request("session.input", {"sessionId": entry.session.id, "data": "x"})
    assert exc2.value.code == ErrorCode.SESSION_STOPPED

    # Unknown method
    with pytest.raises(ProtocolException) as exc3:
        daemon.handle_relay_request("bogus.method", {})
    assert exc3.value.code == ErrorCode.UNSUPPORTED_METHOD


def test_handle_relay_list_and_subscribe(tmp_path):
    daemon = Daemon(_cfg(tmp_path))
    entry = daemon.registry.create("codex", "codex", [], "/tmp/x")
    daemon.registry.mark_running(entry.session.id)
    daemon.registry.record_output(entry.session.id, "line1\n")

    listing = daemon.handle_relay_request("session.list", {})
    assert listing["sessions"][0]["agent"] == "codex"

    view = daemon.handle_relay_request("session.subscribe", {"sessionId": entry.session.id})
    assert view["mode"] == "snapshot"
    assert view["terminalBuffer"] == "line1\n"
