"""Command-line entry point: ``cucoudle <command>``.

Commands:

- ``daemon``     run the long-lived daemon (PTY bridge + relay client)
- ``install``    discover CLI tools, write shims, add the PATH block
- ``uninstall``  remove shims and the PATH block
- ``doctor``     report integration state
- ``pair``       ask the running daemon for a pairing code and show a QR
- ``status``     show daemon/relay/session state
- ``sessions``   list managed sessions
"""

from __future__ import annotations

import argparse
import asyncio
import json
import socket
import struct
import sys

from . import APP_VERSION, ipc
from .config import Config, load_or_create_config
from .installer import doctor as run_doctor
from .installer import install as run_install
from .installer import uninstall as run_uninstall


# ---- sync control client ----------------------------------------------

def _recv_exact(sock: socket.socket, n: int) -> bytes:
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise ConnectionError("daemon closed the connection")
        buf.extend(chunk)
    return bytes(buf)


def control_request(cfg: Config, method: str, params: dict | None = None, timeout: float = 12.0) -> dict:
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(str(cfg.socket_path))
    except OSError as exc:
        raise ConnectionError(
            f"cannot reach daemon at {cfg.socket_path} ({exc}). Is `cucoudle daemon` running?"
        ) from exc
    try:
        sock.sendall(ipc.encode_json(ipc.CONTROL_REQUEST, {"method": method, "params": params or {}}))
        header = _recv_exact(sock, 5)
        _ftype, length = struct.unpack(">BI", header)
        payload = _recv_exact(sock, length) if length else b""
        return json.loads(payload) if payload else {}
    finally:
        sock.close()


# ---- commands ----------------------------------------------------------

def cmd_daemon(cfg: Config, args: argparse.Namespace) -> int:
    from .daemon import Daemon

    daemon = Daemon(cfg)

    async def _main() -> None:
        try:
            await daemon.run()
        except asyncio.CancelledError:
            pass
        finally:
            await daemon.shutdown()

    try:
        asyncio.run(_main())
    except KeyboardInterrupt:
        print("\ncucoudle daemon stopped", file=sys.stderr)
    return 0


def cmd_install(cfg: Config, args: argparse.Namespace) -> int:
    result = run_install(cfg)
    print("Cucoudle shell integration installed.\n")
    if result["installed"]:
        print("  Shims installed for: " + ", ".join(result["installed"]))
    if result["missing"]:
        print("  Not found (no shim):  " + ", ".join(result["missing"]))
    print(f"  Shim directory:       {result['binDir']}")
    if result["shellFiles"]:
        print("  Updated shell config: " + ", ".join(result["shellFiles"]))
    if not result["installed"]:
        print("\n  No supported CLI tools were found on your PATH yet. Install")
        print("  claude/codex/cursor, then re-run `cucoudle install`.")
    print("\nNext steps:")
    print("  1. Open a NEW terminal (or reload your shell config) so the PATH takes effect.")
    print("  2. Start the daemon so sessions are mirrored to your phone:")
    print("        cucoudle daemon       # keep it running")
    print("  3. Run claude / codex / agent as usual, then `cucoudle pair` to link a phone.")
    print("\nSafe by design: if the daemon is not running, your CLIs still work — the")
    print("shim transparently falls back to the real binary. Undo anytime: cucoudle uninstall.")
    return 0


def cmd_uninstall(cfg: Config, args: argparse.Namespace) -> int:
    # Stop the running daemon first so no stale process/socket lingers.
    stopped = False
    try:
        resp = control_request(cfg, "shutdown", timeout=4)
        stopped = bool(resp.get("ok"))
    except ConnectionError:
        pass

    result = run_uninstall(cfg, purge_home=args.purge)
    print("Cucoudle uninstalled.")
    print(f"  Daemon:               {'stopped' if stopped else 'was not running'}")
    if result["removed"]:
        print("  Removed shims:        " + ", ".join(result["removed"]))
    if result["shellFiles"]:
        print("  Cleaned shell config: " + ", ".join(result["shellFiles"]))
    if result.get("homeRemoved"):
        print(f"  Removed home:         {cfg.home}")
    elif not args.purge:
        print(f"  Kept config/logs in:  {cfg.home}  (use --purge to remove everything)")
    print("\nOpen a new terminal for the PATH change to take effect.")
    return 0


def cmd_doctor(cfg: Config, args: argparse.Namespace) -> int:
    info = run_doctor(cfg)
    print(f"Cucoudle doctor  (v{APP_VERSION})\n")
    print(f"  Home:             {info['home']}")
    print(f"  Login shell:      {info['loginShell']}")
    print(f"  Shim interpreter: {info['shimInterpreter']}")
    print(f"  Daemon socket:    {info['socket']}  ({'running' if info['socketExists'] else 'not running'})")
    print(f"  Shim dir on PATH: {'yes' if info['binDirOnPath'] else 'no (open a new terminal after install)'}")
    print("\n  Real binaries:")
    for tool, path in info["realBinaries"].items():
        print(f"    {tool:<8} {path or '(not found)'}")
    print("\n  Shims installed:")
    for tool, ok in info["shimsInstalled"].items():
        print(f"    {tool:<8} {'yes' if ok else 'no'}")
    print("\n  Shell PATH block present in:")
    if info["shellBlocks"]:
        for name in info["shellBlocks"]:
            print(f"    {name}")
    else:
        print("    (none — run `cucoudle install`)")
    if not info["socketExists"]:
        print("\n  Note: daemon is not running. Start it with `cucoudle daemon` to enable")
        print("  remote control (CLIs still work locally without it).")
    return 0


def cmd_pair(cfg: Config, args: argparse.Namespace) -> int:
    try:
        resp = control_request(cfg, "pairing.create", {"ttlSeconds": args.ttl})
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    if not resp.get("ok"):
        err = resp.get("error", {})
        print(f"error: {err.get('message', 'pairing failed')}", file=sys.stderr)
        return 1
    result = resp["result"]
    payload = result.get("qrPayload", result)
    print("Scan this QR in the Cucoudle mobile app:\n")
    _print_qr(json.dumps(payload))
    print()
    print(f"  Desktop:  {result.get('desktopId')}")
    print(f"  Code:     {result.get('pairingCode')}")
    print(f"  Expires:  {result.get('expiresAt')}")
    print(f"  Relay:    {payload.get('relayUrl', cfg.relay_url)}")
    return 0


def cmd_status(cfg: Config, args: argparse.Namespace) -> int:
    try:
        resp = control_request(cfg, "status")
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    result = resp.get("result", {})
    print(f"Desktop:   {result.get('desktopName')} ({result.get('desktopId')})")
    print(f"Platform:  {result.get('platform')}  v{result.get('appVersion')}")
    conn = "connected" if result.get("relayConnected") else "disconnected"
    reg = "registered" if result.get("registered") else "not registered"
    print(f"Relay:     {result.get('relayUrl')}  [{conn}, {reg}]")
    devices = result.get("pairedDevices", [])
    print(f"Paired:    {len(devices)} device(s)")
    for d in devices:
        print(f"           - {d.get('name')} ({d.get('platform')})")
    _print_sessions(result.get("sessions", []))
    return 0


def cmd_sessions(cfg: Config, args: argparse.Namespace) -> int:
    try:
        resp = control_request(cfg, "session.list")
    except ConnectionError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    _print_sessions(resp.get("result", {}).get("sessions", []))
    return 0


# ---- helpers -----------------------------------------------------------

def _print_sessions(sessions: list[dict]) -> None:
    print(f"\nSessions:  {len(sessions)}")
    for s in sessions:
        print(f"  {s['id']}  {s['agent']:<7} {s['status']:<8} {s['title']}")


def _print_qr(text: str) -> None:
    try:
        import qrcode

        qr = qrcode.QRCode(border=1)
        qr.add_data(text)
        qr.make(fit=True)
        qr.print_ascii(invert=True)
    except Exception:  # noqa: BLE001 - qr rendering is best-effort
        print("(install `qrcode` to render a QR; payload below)")
        print(text)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cucoudle", description="Cucoudle desktop daemon and shell integration")
    parser.add_argument("--version", action="version", version=f"cucoudle {APP_VERSION}")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("daemon", help="run the daemon (PTY bridge + relay client)")
    sub.add_parser("install", help="install shims and shell PATH block")
    p_uninstall = sub.add_parser("uninstall", help="stop the daemon and remove shims and shell PATH block")
    p_uninstall.add_argument("--purge", action="store_true",
                             help="also delete the entire ~/.cucoudle home (config, logs)")
    sub.add_parser("doctor", help="report integration state")
    p_pair = sub.add_parser("pair", help="create a pairing code and show a QR")
    p_pair.add_argument("--ttl", type=int, default=300, help="pairing code TTL in seconds")
    sub.add_parser("status", help="show daemon/relay/session state")
    sub.add_parser("sessions", help="list managed sessions")
    return parser


_HANDLERS = {
    "daemon": cmd_daemon,
    "install": cmd_install,
    "uninstall": cmd_uninstall,
    "doctor": cmd_doctor,
    "pair": cmd_pair,
    "status": cmd_status,
    "sessions": cmd_sessions,
}


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    cfg = load_or_create_config()
    handler = _HANDLERS[args.command]
    return handler(cfg, args)


if __name__ == "__main__":
    raise SystemExit(main())
