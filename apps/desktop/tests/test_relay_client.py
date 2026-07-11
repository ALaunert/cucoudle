import asyncio
import json

import pytest
import websockets

from cucoudle_desktop.config import Config
from cucoudle_desktop.protocol import PROTOCOL_VERSION, ErrorCode, ProtocolException
from cucoudle_desktop.relay_client import RelayClient


class FakeDaemon:
    def __init__(self):
        self.logs = []
        self.registered_called = False
        self.paired = []
        self.stopped = False

    def log(self, m):
        self.logs.append(m)

    def request_stop(self, reason=""):
        self.stopped = True

    def handle_relay_request(self, method, params):
        if method == "session.list":
            return {"sessions": []}
        raise ProtocolException(ErrorCode.UNSUPPORTED_METHOD, "no")

    def on_relay_registered(self):
        self.registered_called = True

    def on_mobile_paired(self, data):
        self.paired.append(data)

    def on_mobile_disconnected(self, data):
        pass


def _resp(mid, result):
    return json.dumps({
        "version": PROTOCOL_VERSION, "kind": "response", "id": mid,
        "ok": True, "result": result, "sentAt": "t",
    })


def _req(mid, method, params):
    return json.dumps({
        "version": PROTOCOL_VERSION, "kind": "request", "id": mid,
        "method": method, "params": params, "sentAt": "t",
    })


def _event(name, data):
    return json.dumps({
        "version": PROTOCOL_VERSION, "kind": "event", "event": name,
        "data": data, "sentAt": "t",
    })


@pytest.mark.asyncio
async def test_relay_register_pair_forward_and_events(tmp_path):
    forward_response: asyncio.Future = asyncio.get_running_loop().create_future()
    events: list = []

    async def handler(ws):
        # Immediately forward a mobile request to the desktop.
        await ws.send(_req("fwd_1", "session.list", {}))
        # And announce a paired mobile device.
        await ws.send(_event("mobile.paired", {"mobileDevice": {"id": "mob_1", "name": "iPhone", "platform": "ios"}}))
        async for raw in ws:
            msg = json.loads(raw)
            if msg["kind"] == "request":
                if msg["method"] == "desktop.register":
                    await ws.send(_resp(msg["id"], {"registered": True}))
                elif msg["method"] == "desktop.pairing.create":
                    await ws.send(_resp(msg["id"], {
                        "desktopId": "desk_test",
                        "pairingCode": "123456",
                        "expiresAt": "2026-07-11T12:00:00Z",
                        "qrPayload": {"pairingCode": "123456", "relayUrl": "ws://x"},
                    }))
            elif msg["kind"] == "response":
                if not forward_response.done():
                    forward_response.set_result(msg)
            elif msg["kind"] == "event":
                events.append(msg)

    server = await websockets.serve(handler, "localhost", 0)
    port = server.sockets[0].getsockname()[1]
    cfg = Config("desk_test", "test", "linux", "0.1.0", f"ws://localhost:{port}", home=tmp_path)
    fake = FakeDaemon()
    relay = RelayClient(cfg, fake)
    await relay.start()
    try:
        for _ in range(60):
            if relay.registered:
                break
            await asyncio.sleep(0.05)
        assert relay.registered
        assert fake.registered_called

        fr = await asyncio.wait_for(forward_response, 3)
        assert fr["ok"] is True
        assert fr["id"] == "fwd_1"
        assert fr["result"] == {"sessions": []}

        assert fake.paired and fake.paired[0]["mobileDevice"]["id"] == "mob_1"

        result = await relay.create_pairing(60)
        assert result["pairingCode"] == "123456"

        await relay.send_event("terminal.output", {"sessionId": "s", "seq": 1, "data": "hi"})
        for _ in range(60):
            if events:
                break
            await asyncio.sleep(0.05)
        assert events and events[0]["event"] == "terminal.output"
    finally:
        await relay.stop()
        server.close()
        await server.wait_closed()


@pytest.mark.asyncio
async def test_superseded_by_4001_steps_down_without_reconnect(tmp_path):
    connects = 0

    async def handler(ws):
        nonlocal connects
        connects += 1
        # Kick the desktop like the relay does when a newer daemon takes over.
        await ws.close(code=4001, reason="replaced by a new connection")

    server = await websockets.serve(handler, "localhost", 0)
    port = server.sockets[0].getsockname()[1]
    cfg = Config("desk_dup", "test", "linux", "0.1.0", f"ws://localhost:{port}", home=tmp_path)
    fake = FakeDaemon()
    relay = RelayClient(cfg, fake)
    await relay.start()
    try:
        for _ in range(60):
            if fake.stopped:
                break
            await asyncio.sleep(0.05)
        assert fake.stopped, "daemon should be asked to stop when superseded (4001)"
        assert relay._stop is True
        # Must NOT keep reconnecting (no ping-pong): connection count stays put.
        first = connects
        await asyncio.sleep(0.6)
        assert connects == first, f"reconnected after 4001 ({connects} > {first})"
    finally:
        await relay.stop()
        server.close()
        await server.wait_closed()


@pytest.mark.asyncio
async def test_create_pairing_fails_when_not_registered(tmp_path):
    cfg = Config("desk_test", "test", "linux", "0.1.0", "ws://localhost:59998", home=tmp_path)
    relay = RelayClient(cfg, FakeDaemon())
    # Never started -> not registered.
    with pytest.raises(ProtocolException):
        await relay.create_pairing(1, timeout=0.2)
