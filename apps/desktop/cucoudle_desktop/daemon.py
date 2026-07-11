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
import sys
from datetime import datetime, timezone
from typing import Any

from . import APP_VERSION
from .config import MANAGED_ENV_FLAG, SESSION_ENV_VAR, Config
from . import ipc
from .protocol import ErrorCode, ProtocolException
from .registry import SessionRegistry
from .relay_client import RelayClient
from .session import GenericPtySession


class Daemon:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.registry = SessionRegistry()
        self.relay = RelayClient(cfg, self)
        self._server: asyncio.AbstractServer | None = None
        self._shim_writers: dict[str, asyncio.StreamWriter] = {}
        self._decoders: dict[str, codecs.IncrementalDecoder] = {}
        self.paired_devices: list[dict] = []
        self._log_fh = None

    # ---- logging -------------------------------------------------------
    def log(self, message: str) -> None:
        stamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
        line = f"[{stamp}] {message}"
        print(line, file=sys.stderr, flush=True)
        if self._log_fh is not None:
            self._log_fh.write(line + "\n")
            self._log_fh.flush()

    # ---- lifecycle -----------------------------------------------------
    async def run(self) -> None:
        self.cfg.home.mkdir(parents=True, exist_ok=True)
        self._log_fh = open(self.cfg.log_path, "a", encoding="utf-8")
        sock_path = self.cfg.socket_path
        if sock_path.exists():
            sock_path.unlink()
        self._server = await asyncio.start_unix_server(self._handle_conn, path=str(sock_path))
        os.chmod(sock_path, 0o600)
        await self.relay.start()
        self.log(f"daemon listening on {sock_path}")
        self.log(f"relay target: {self.cfg.relay_url}  desktopId={self.cfg.desktop_id}")
        async with self._server:
            await self._server.serve_forever()

    async def shutdown(self) -> None:
        self.log("shutting down")
        for entry in self.registry.all():
            if entry.pty and entry.pty.running:
                entry.pty.terminate()
        await self.relay.stop()
        if self._server is not None:
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
                    pty.resize(int(d.get("cols", cols)), int(d.get("rows", rows)))
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
        seq = self.registry.record_output(sid, text)
        if seq is not None:
            self._emit("terminal.output", {"sessionId": sid, "seq": seq, "data": text})

    def _on_exit(self, sid: str, code: int | None) -> None:
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
            data = str(params.get("data", ""))
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
            entry.pty.resize(int(params.get("cols", 80)), int(params.get("rows", 24)))
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
