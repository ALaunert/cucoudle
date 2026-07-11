"""Desktop-side relay client.

Maintains one WebSocket connection to the relay (``/v1/ws/desktop``), registers
the desktop, correlates desktop-initiated requests (``desktop.register``,
``desktop.pairing.create``) with their responses, dispatches relay-forwarded
mobile requests to the daemon, and streams desktop events.

Reconnects with backoff. The local terminal sessions are unaffected by relay
outages — this client only mirrors and steers them.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import websockets

from . import APP_VERSION
from .protocol import (
    ErrorCode,
    ProtocolException,
    RequestMessage,
    ResponseMessage,
    dump,
    make_error,
    make_event,
    make_request,
    make_response,
    parse_envelope,
)

if TYPE_CHECKING:  # pragma: no cover
    from .daemon import Daemon

RECONNECT_MAX_BACKOFF = 15.0
# Relay closes an older desktop socket with this code when a newer connection
# registers the same desktopId ("last writer wins"). The replaced instance must
# step down instead of reconnecting, or the two daemons ping-pong forever.
REPLACED_CLOSE_CODE = 4001


def _close_code(exc: Exception) -> int | None:
    """Best-effort extraction of a WebSocket close code from an exception."""
    for attr in ("rcvd", "sent"):
        frame = getattr(exc, attr, None)
        code = getattr(frame, "code", None)
        if isinstance(code, int):
            return code
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    if str(REPLACED_CLOSE_CODE) in str(exc):
        return REPLACED_CLOSE_CODE
    return None


class RelayClient:
    def __init__(self, cfg, daemon: "Daemon") -> None:
        self.cfg = cfg
        self.daemon = daemon
        self._ws = None
        self._pending: dict[str, asyncio.Future] = {}
        self._req_counter = 0
        self._registered = asyncio.Event()
        self._stop = False
        self._task: asyncio.Task | None = None

    @property
    def connected(self) -> bool:
        return self._ws is not None

    @property
    def registered(self) -> bool:
        return self._registered.is_set()

    def _next_id(self) -> str:
        self._req_counter += 1
        return f"desk_req_{self._req_counter}"

    @property
    def _desktop_url(self) -> str:
        return self.cfg.relay_url.rstrip("/") + "/v1/ws/desktop"

    # ---- lifecycle -----------------------------------------------------
    async def start(self) -> None:
        self._task = asyncio.create_task(self._run(), name="relay-client")

    async def stop(self) -> None:
        self._stop = True
        if self._ws is not None:
            await self._ws.close()
        if self._task is not None:
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stop:
            superseded = False
            try:
                async with websockets.connect(self._desktop_url, max_size=None) as ws:
                    self._ws = ws
                    backoff = 1.0
                    self.daemon.log(f"relay connected: {self._desktop_url}")
                    asyncio.create_task(self._register(), name="relay-register")
                    async for raw in ws:
                        await self._on_message(raw)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 - report and retry
                if _close_code(exc) == REPLACED_CLOSE_CODE:
                    superseded = True
                else:
                    self.daemon.log(f"relay connection lost: {exc}")
            finally:
                self._ws = None
                self._registered.clear()
                self._fail_pending()
            if superseded:
                # Another daemon registered the same desktopId and took over.
                # Step down (don't reconnect) so the newest instance wins cleanly.
                self.daemon.log(
                    f"another daemon registered desktopId {self.cfg.desktop_id}; "
                    "stepping down to avoid a reconnect loop"
                )
                self._stop = True
                self.daemon.request_stop("superseded by another daemon for this desktopId")
                break
            if self._stop:
                break
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, RECONNECT_MAX_BACKOFF)

    def _fail_pending(self) -> None:
        for fut in self._pending.values():
            if not fut.done():
                fut.set_exception(ConnectionError("relay disconnected"))
        self._pending.clear()

    async def _register(self) -> None:
        try:
            resp = await self.request(
                "desktop.register",
                {
                    "desktopId": self.cfg.desktop_id,
                    "desktopName": self.cfg.desktop_name,
                    "platform": self.cfg.platform,
                    "appVersion": APP_VERSION,
                    "offeredCapabilities": ["interaction.structured"],
                },
            )
        except Exception as exc:  # noqa: BLE001
            self.daemon.log(f"desktop.register failed: {exc}")
            return
        if resp.ok:
            self._registered.set()
            self.daemon.log("desktop registered with relay")
            self.daemon.on_relay_registered()
        else:
            err = resp.error.message if resp.error else "unknown"
            self.daemon.log(f"desktop.register rejected: {err}")

    # ---- outbound ------------------------------------------------------
    async def request(self, method: str, params: dict[str, Any], timeout: float = 10.0) -> ResponseMessage:
        if self._ws is None:
            raise ConnectionError("relay not connected")
        rid = self._next_id()
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        await self._ws.send(dump(make_request(method, params, rid)))
        try:
            return await asyncio.wait_for(fut, timeout)
        finally:
            self._pending.pop(rid, None)

    async def send_event(self, event: str, data: dict[str, Any]) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.send(dump(make_event(event, data)))
        except Exception as exc:  # noqa: BLE001
            self.daemon.log(f"failed to send event {event}: {exc}")

    async def create_pairing(self, ttl_seconds: int = 300, timeout: float = 10.0) -> dict:
        try:
            await asyncio.wait_for(self._registered.wait(), timeout)
        except asyncio.TimeoutError as exc:
            raise ProtocolException("RELAY_OFFLINE", "not registered with relay") from exc
        resp = await self.request("desktop.pairing.create", {"ttlSeconds": ttl_seconds})
        if resp.ok and resp.result is not None:
            return resp.result
        message = resp.error.message if resp.error else "pairing.create failed"
        raise ProtocolException("RELAY_OFFLINE", message)

    # ---- inbound -------------------------------------------------------
    async def _on_message(self, raw) -> None:
        try:
            msg = parse_envelope(raw)
        except ValueError as exc:
            self.daemon.log(f"dropping invalid relay message: {exc}")
            return

        if isinstance(msg, ResponseMessage):
            fut = self._pending.get(msg.id)
            if fut is not None and not fut.done():
                fut.set_result(msg)
            return

        if isinstance(msg, RequestMessage):
            await self._handle_request(msg)
            return

        # EventMessage from relay (mobile presence).
        if msg.event == "mobile.paired":
            self.daemon.on_mobile_paired(msg.data)
        elif msg.event == "mobile.disconnected":
            self.daemon.on_mobile_disconnected(msg.data)
        # Unknown events are ignored per the contract.

    async def _handle_request(self, req: RequestMessage) -> None:
        try:
            result = self.daemon.handle_relay_request(req.method, req.params)
            response = make_response(req.id, result)
        except ProtocolException as exc:
            code = exc.code if isinstance(exc.code, ErrorCode) else ErrorCode(exc.code)
            response = make_error(req.id, code, exc.message, exc.details)
        except Exception as exc:  # noqa: BLE001
            response = make_error(req.id, ErrorCode.INTERNAL_ERROR, str(exc))
        if self._ws is not None:
            await self._ws.send(dump(response))
