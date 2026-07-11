"""The Cucoudle desktop daemon.

Ties together three concerns:

- a Unix-socket server that shims and the CLI connect to (terminal bridge +
  control channel);
- the local :class:`SessionRegistry` (source of truth for sessions);
- the :class:`RelayClient` that mirrors sessions to, and accepts commands from,
  paired mobile devices via the relay.

PTY output is fanned out to the local shim, the relay, and the replay buffer.
Input arrives either from the shim (local terminal) or the relay (mobile).
"""

from __future__ import annotations

import asyncio
import codecs
import os
import shutil
import socket
import sys
from datetime import datetime, timezone
from typing import Any

from . import APP_VERSION
from .config import MANAGED_ENV_FLAG, SESSION_ENV_VAR, Config
from . import ipc
from .protocol import ErrorCode, ProtocolException
from .registry import SessionRegistry
from .relay_client import RelayClient
from .render import TerminalRenderer
from .session import GenericPtySession

# Coalesce terminal.render frames: TUI spinners redraw far more often than a
# phone can usefully repaint, so batch PTY output into ~20fps frames.
RENDER_FLUSH_DELAY = 0.05


class DaemonAlreadyRunning(RuntimeError):
    """Raised when another live daemon already owns this home's control socket."""


class Daemon:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.registry = SessionRegistry()
        self.relay = RelayClient(cfg, self)
        self._server: asyncio.AbstractServer | None = None
        self._shim_writers: dict[str, asyncio.StreamWriter] = {}
        self._decoders: dict[str, codecs.IncrementalDecoder] = {}
        self._render_pending: set[str] = set()
        self.paired_devices: list[dict] = []
        self._log_fh = None
        self._stop_event: asyncio.Event | None = None

    # ---- logging -------------------------------------------------------
    def log(self, message: str) -> None:
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{stamp}] {message}"
        print(line, file=sys.stderr, flush=True)
        if self._log_fh is not None:
            self._log_fh.write(line + "\n")
            self._log_fh.flush()

    # ---- lifecycle -----------------------------------------------------
    def _existing_daemon_alive(self) -> bool:
        """True if another daemon is already listening on our control socket.

        Distinguishes a live daemon (connect succeeds) from a stale socket file
        left by a crashed one (connect refused), so we never steal a live
        socket and orphan the running daemon.
        """
        sock_path = self.cfg.socket_path
        if not sock_path.exists():
            return False
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        probe.settimeout(0.5)
        try:
            probe.connect(str(sock_path))
            return True
        except OSError:
            return False
        finally:
            probe.close()

    async def run(self) -> None:
        self.cfg.home.mkdir(parents=True, exist_ok=True)
        self._log_fh = open(self.cfg.log_path, "a", encoding="utf-8")
        sock_path = self.cfg.socket_path
        if self._existing_daemon_alive():
            raise DaemonAlreadyRunning(
                f"another cucoudle daemon is already running for {self.cfg.home} "
                f"(socket {sock_path})"
            )
        if sock_path.exists():
            sock_path.unlink()  # stale socket from a crashed daemon
        self._server = await asyncio.start_unix_server(self._handle_conn, path=str(sock_path))
        os.chmod(sock_path, 0o600)
        await self.relay.start()
        self._stop_event = asyncio.Event()
        self.log(f"daemon listening on {sock_path}")
        self.log(f"relay target: {self.cfg.relay_url}  desktopId={self.cfg.desktop_id}")
        async with self._server:
            serve_task = asyncio.ensure_future(self._server.serve_forever())
            stop_task = asyncio.ensure_future(self._stop_event.wait())
            try:
                await asyncio.wait({serve_task, stop_task}, return_when=asyncio.FIRST_COMPLETED)
            finally:
                serve_task.cancel()
                stop_task.cancel()

    def request_stop(self, reason: str = "") -> None:
        """Ask the running daemon to stop its main loop and shut down cleanly.

        Called from the relay client when this instance is superseded by a newer
        daemon for the same desktopId, so it steps down instead of ping-ponging.
        """
        if reason:
            self.log(f"stopping: {reason}")
        if self._stop_event is not None:
            self._stop_event.set()

    async def shutdown(self) -> None:
        self.log("shutting down")
        for entry in self.registry.all():
            if entry.pty and entry.pty.running:
                entry.pty.terminate()
        await self.relay.stop()
        if self._server is not None:
            # Only remove the socket we created; never touch another daemon's.
            self._server.close()
            if self.cfg.socket_path.exists():
                try:
                    self.cfg.socket_path.unlink()
                except OSError:
                    pass
        if self._log_fh is not None:
            self._log_fh.close()

    # ---- connection dispatch ------------------------------------------
    async def _handle_conn(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        first = await ipc.read_frame(reader)
        if first is None:
            writer.close()
            return
        if first.type == ipc.HELLO:
            await self._handle_shim(first, reader, writer)
        elif first.type == ipc.CONTROL_REQUEST:
            await self._handle_control(first, writer)
        else:
            writer.close()

    # ---- shim / terminal bridge ---------------------------------------
    async def _handle_shim(self, hello: ipc.Frame, reader: asyncio.StreamReader,
                           writer: asyncio.StreamWriter) -> None:
        info = hello.json()
        tool = str(info.get("tool", "unknown"))
        argv = list(info.get("argv", []))
        cwd = str(info.get("cwd", "") or os.path.expanduser("~"))
        env = dict(info.get("env", {}))
        cols = int(info.get("cols", 80) or 80)
        rows = int(info.get("rows", 24) or 24)

        real = self._resolve_real(tool)
        if real is None:
            writer.write(ipc.encode_json(ipc.ERROR, {
                "code": ErrorCode.TOOL_NOT_FOUND.value,
                "message": f"no real binary configured for '{tool}'",
            }))
            await writer.drain()
            writer.close()
            return

        entry = self.registry.create(tool=tool, command=tool, argv=argv, cwd=cwd)
        entry.renderer = TerminalRenderer(cols=cols, rows=rows)
        sid = entry.session.id
        env[MANAGED_ENV_FLAG] = "1"
        env[SESSION_ENV_VAR] = sid
        env.setdefault("TERM", "xterm-256color")

        self._shim_writers[sid] = writer
        self._decoders[sid] = codecs.getincrementaldecoder("utf-8")("replace")

        pty = GenericPtySession(
            argv=[real] + argv,
            cwd=cwd,
            env=env,
            cols=cols,
            rows=rows,
            on_output=lambda data, s=sid: self._on_output(s, data),
            on_exit=lambda code, s=sid: self._on_exit(s, code),
        )
        entry.pty = pty
        try:
            pty.start()
        except Exception as exc:  # noqa: BLE001
            self.log(f"failed to start session {sid}: {exc}")
            writer.write(ipc.encode_json(ipc.ERROR, {
                "code": ErrorCode.INTERNAL_ERROR.value,
                "message": f"failed to launch {tool}: {exc}",
            }))
            await writer.drain()
            self._cleanup_session(sid)
            writer.close()
            return

        self.registry.mark_running(sid)
        writer.write(ipc.encode_json(ipc.READY, {"sessionId": sid}))
        await writer.drain()
        self.log(f"session {sid} started: {tool} {' '.join(argv)} (cwd={cwd})")
        self._emit("session.created", {"session": entry.session.model_dump(exclude_none=True)})

        # Pump local terminal input until the shim disconnects. The daemon owns
        # the PTY master, so a shim disconnect does NOT kill the session; mobile
        # can keep steering it.
        try:
            while True:
                frame = await ipc.read_frame(reader)
                if frame is None:
                    break
                if frame.type == ipc.STDIN:
                    try:
                        pty.write(frame.payload)
                    except OSError:
                        break
                elif frame.type == ipc.RESIZE:
                    d = frame.json()
                    new_cols, new_rows = int(d.get("cols", cols)), int(d.get("rows", rows))
                    pty.resize(new_cols, new_rows)
                    if entry.renderer is not None:
                        entry.renderer.resize(new_cols, new_rows)
                elif frame.type == ipc.STDIN_EOF:
                    pass  # local stdin closed; keep session for remote control
        finally:
            if self._shim_writers.get(sid) is writer:
                self._shim_writers.pop(sid, None)
            try:
                writer.close()
            except OSError:
                pass
            self.log(f"shim for session {sid} detached")

    def _resolve_real(self, tool: str) -> str | None:
        real = self.cfg.real_binaries.get(tool)
        if real and os.path.exists(real):
            return real
        found = shutil.which(tool, path=self._path_excluding_bin())
        return found

    def _path_excluding_bin(self) -> str:
        bin_dir = str(self.cfg.bin_dir)
        entries = [p for p in os.environ.get("PATH", "").split(os.pathsep)
                   if p and os.path.abspath(p) != os.path.abspath(bin_dir)]
        return os.pathsep.join(entries)

    def _on_output(self, sid: str, data: bytes) -> None:
        writer = self._shim_writers.get(sid)
        if writer is not None:
            try:
                writer.write(ipc.encode(ipc.STDOUT, data))
            except Exception:  # noqa: BLE001 - shim may have gone away
                self._shim_writers.pop(sid, None)
        decoder = self._decoders.get(sid)
        text = decoder.decode(data) if decoder else data.decode("utf-8", "replace")
        if not text:
            return
        if "\x1b[?2004" in text:
            # Track bracketed-paste mode so session.input can deliver text as a
            # real paste + Enter, matching how the TUI expects submitted input.
            bp = getattr(self, "_bracketed_paste", None)
            if bp is None:
                bp = self._bracketed_paste = {}
            if "\x1b[?2004l" in text:
                bp[sid] = False
            if "\x1b[?2004h" in text:
                bp[sid] = True
        seq = self.registry.record_output(sid, text)
        if seq is not None:
            self._emit("terminal.output", {"sessionId": sid, "seq": seq, "data": text})
        entry = self.registry.get(sid)
        if entry is not None and entry.renderer is not None:
            try:
                entry.renderer.feed(data)
            except Exception as exc:  # noqa: BLE001 - rendering must never break PTY I/O
                self.log(f"terminal renderer disabled sid={sid}: {type(exc).__name__}: {exc}")
                entry.renderer = None
            else:
                self._schedule_render(sid)

    def _schedule_render(self, sid: str) -> None:
        if sid in self._render_pending:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:  # pragma: no cover - tests call sync
            return
        self._render_pending.add(sid)
        loop.call_later(RENDER_FLUSH_DELAY, self._flush_render, sid)

    def _flush_render(self, sid: str) -> None:
        self._render_pending.discard(sid)
        entry = self.registry.get(sid)
        if entry is None or entry.renderer is None:
            return
        self._emit("terminal.render", entry.renderer.take_frame(sid))

    def _on_exit(self, sid: str, code: int | None) -> None:
        self._flush_render(sid)  # final frame so mobile sees the last output
        self.registry.mark_ended(sid, code)
        writer = self._shim_writers.get(sid)
        if writer is not None:
            try:
                writer.write(ipc.encode_json(ipc.EXIT, {"exitCode": code if code is not None else 0}))
            except Exception:  # noqa: BLE001
                pass
        self.log(f"session {sid} ended (exit={code})")
        self._emit("session.ended", {"sessionId": sid, "exitCode": code})
        self._decoders.pop(sid, None)

    def _cleanup_session(self, sid: str) -> None:
        self._shim_writers.pop(sid, None)
        self._decoders.pop(sid, None)
        self.registry.remove(sid)

    def _emit(self, event: str, data: dict[str, Any]) -> None:
        try:
            asyncio.get_running_loop().create_task(self.relay.send_event(event, data))
        except RuntimeError:  # pragma: no cover - no loop (tests may call directly)
            pass

    # ---- control channel (CLI <-> daemon) -----------------------------
    async def _handle_control(self, frame: ipc.Frame, writer: asyncio.StreamWriter) -> None:
        req = frame.json()
        method = str(req.get("method", ""))
        params = dict(req.get("params", {}))
        try:
            result = await self._control(method, params)
            payload = {"ok": True, "result": result}
        except ProtocolException as exc:
            code = exc.code.value if isinstance(exc.code, ErrorCode) else exc.code
            payload = {"ok": False, "error": {"code": code, "message": exc.message}}
        except Exception as exc:  # noqa: BLE001
            payload = {"ok": False, "error": {"code": "INTERNAL_ERROR", "message": str(exc)}}
        writer.write(ipc.encode_json(ipc.CONTROL_RESPONSE, payload))
        await writer.drain()
        writer.close()

    async def _control(self, method: str, params: dict) -> dict:
        if method == "status":
            return {
                "desktopId": self.cfg.desktop_id,
                "desktopName": self.cfg.desktop_name,
                "platform": self.cfg.platform,
                "appVersion": APP_VERSION,
                "relayUrl": self.cfg.relay_url,
                "relayConnected": self.relay.connected,
                "registered": self.relay.registered,
                "sessions": [s.model_dump(exclude_none=True) for s in self.registry.sessions()],
                "pairedDevices": self.paired_devices,
            }
        if method == "session.list":
            return {"sessions": [s.model_dump(exclude_none=True) for s in self.registry.sessions()]}
        if method == "pairing.create":
            ttl = int(params.get("ttlSeconds", 300))
            return await self.relay.create_pairing(ttl)
        if method == "shutdown":
            # Defer the stop so this response flushes to the caller first.
            if self._stop_event is not None:
                asyncio.get_running_loop().call_later(0.2, self._stop_event.set)
            return {"stopping": True}
        raise ProtocolException("UNSUPPORTED_METHOD", f"unknown control method '{method}'")

    # ---- relay-forwarded mobile requests ------------------------------
    def handle_relay_request(self, method: str, params: dict) -> dict:
        if method == "session.list":
            return {"sessions": [s.model_dump(exclude_none=True) for s in self.registry.sessions()]}

        if method == "session.subscribe":
            sid = str(params.get("sessionId", ""))
            after = params.get("afterSeq")
            view = self.registry.subscribe_view(sid, after)
            if view is None:
                raise ProtocolException(ErrorCode.SESSION_NOT_FOUND, f"session '{sid}' not found")
            return view

        if method == "session.input":
            entry = self._require_active(params)
            sid = str(params.get("sessionId", ""))
            data = str(params.get("data", ""))
            if params.get("inputMode") == "text":
                # Deliver composer text the way a real terminal does: as an
                # explicit paste (when the TUI enabled bracketed paste, e.g.
                # codex/claude) plus a SEPARATE, slightly-later Enter keypress.
                # A single "text\r" burst is read as one chunk and treated as a
                # paste, so the Enter never submits; the gap makes the app see a
                # discrete Return like a human pressing it.
                submit = bool(params.get("submit")) or data.endswith(("\n", "\r"))
                body = data.rstrip("\r\n") if submit else data
                bp = bool(getattr(self, "_bracketed_paste", {}).get(sid))
                if body and bp:
                    body = "\x1b[200~" + body + "\x1b[201~"
                self.log(f"session.input sid={sid} bracketed={bp} submit={submit} bodybytes={len(body)}")
                try:
                    if body:
                        entry.pty.write(body.encode("utf-8"))
                    if submit:
                        self._submit_enter(entry.pty)
                except (OSError, AttributeError) as exc:
                    raise ProtocolException(ErrorCode.PTY_WRITE_FAILED, str(exc))
                return {"accepted": True}
            try:
                entry.pty.write(data.encode("utf-8"))
            except (OSError, AttributeError) as exc:
                raise ProtocolException(ErrorCode.PTY_WRITE_FAILED, str(exc))
            return {"accepted": True}

        if method == "session.interrupt":
            entry = self._require_active(params)
            entry.pty.interrupt()
            return {"accepted": True}

        if method == "terminal.resize":
            entry = self._require_active(params)
            cols, rows = int(params.get("cols", 80)), int(params.get("rows", 24))
            entry.pty.resize(cols, rows)
            if entry.renderer is not None:
                entry.renderer.resize(cols, rows)
            return {"accepted": True}

        raise ProtocolException(ErrorCode.UNSUPPORTED_METHOD, f"unknown method '{method}'")

    def _require_active(self, params: dict):
        sid = str(params.get("sessionId", ""))
        entry = self.registry.get(sid)
        if entry is None:
            raise ProtocolException(ErrorCode.SESSION_NOT_FOUND, f"session '{sid}' not found")
        if entry.pty is None or not entry.pty.running:
            raise ProtocolException(ErrorCode.SESSION_STOPPED, f"session '{sid}' is not running")
        return entry

    def _submit_enter(self, pty) -> None:
        """Send Enter as a discrete keypress, slightly after the text write, so a
        TUI reads it as a separate Return event and submits (a same-chunk CR is
        swallowed as part of the paste)."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        if loop is not None:
            loop.call_later(0.06, lambda: self._safe_write(pty, b"\r"))
        else:
            self._safe_write(pty, b"\r")

    @staticmethod
    def _safe_write(pty, payload: bytes) -> None:
        try:
            pty.write(payload)
        except OSError:
            pass

    # ---- relay events -------------------------------------------------
    def on_relay_registered(self) -> None:
        # Re-advertise active sessions after (re)connect so mobile can resync.
        for entry in self.registry.all():
            self._emit("session.updated", {"session": entry.session.model_dump(exclude_none=True)})

    def on_mobile_paired(self, data: dict) -> None:
        device = data.get("mobileDevice") or {}
        did = device.get("id")
        self.paired_devices = [d for d in self.paired_devices if d.get("id") != did]
        self.paired_devices.append(device)
        self.log(f"mobile paired: {device.get('name', did)}")

    def on_mobile_disconnected(self, data: dict) -> None:
        did = data.get("mobileDeviceId")
        self.paired_devices = [d for d in self.paired_devices if d.get("id") != did]
        self.log(f"mobile disconnected: {did}")
