# Cucoudle desktop daemon

Python daemon and shell integration for the desktop side of Cucoudle. It runs
your CLI agents (`claude`, `codex`, `agent`, `cursor`) inside a managed
pseudo-terminal, mirrors the terminal output to the phone through the relay, and
feeds mobile input back into the live process — without changing how you launch
the CLI.

This is Developer 1's component from
[`docs/hackathon-implementation-plan.md`](../../docs/hackathon-implementation-plan.md).
Wire behaviour follows [`docs/protocol-contracts.md`](../../docs/protocol-contracts.md).

## How it works

```text
terminal ──▶ ~/.cucoudle/bin/<tool> (shim) ──▶ daemon (Unix socket)
                                                   │  launches real binary in a PTY
                                                   ├──▶ local terminal (bytes back to the shim)
                                                   ├──▶ replay buffer (SQLite/in-memory)
                                                   └──▶ relay WebSocket ──▶ mobile app
```

- The **shim** is a tiny standard-library Python program. If the daemon is down,
  stdin is not a tty, or it is already inside a managed session, it transparently
  `exec`s the real binary — installing Cucoudle never breaks normal CLI use.
- The **daemon** owns the PTY master, so closing the local terminal does *not*
  kill the session; the phone can keep steering it.
- Local channel: length-prefixed frames over a Unix socket (`~/.cucoudle/daemon.sock`).
- Remote channel: the versioned JSON envelope from the protocol contract over a
  WebSocket to the relay (`/v1/ws/desktop`).

## Setup

```bash
cd apps/desktop
python3 -m venv .venv
./.venv/bin/pip install -e ".[dev]"
```

## Commands

```bash
cucoudle daemon      # run the long-lived daemon (PTY bridge + relay client)
cucoudle install     # discover CLI tools, write shims, add the PATH block
cucoudle uninstall   # remove shims and the PATH block
cucoudle doctor      # report integration state
cucoudle pair        # ask the running daemon for a pairing code + QR
cucoudle status      # daemon / relay / paired-devices / sessions
cucoudle sessions    # list managed sessions
```

`CUCOUDLE_HOME` overrides `~/.cucoudle`; `CUCOUDLE_RELAY_URL` overrides the relay
URL (default `ws://localhost:8787`).

## Local demo (no relay needed)

```bash
# terminal A
cucoudle daemon

# terminal B
cucoudle install          # then open a new shell, or add ~/.cucoudle/bin to PATH
claude                    # or: codex / agent / bash
cucoudle sessions         # see the managed session appear
```

To also exercise the mobile path, start the relay
(`apps/relay`, Developer 3), run `cucoudle pair`, and scan the QR.

## Tests

```bash
./.venv/bin/python -m pytest
```

Covers the protocol envelope, IPC framing, installer (binary discovery, shim
generation, idempotent shell-config editing), the session registry
(seq/replay/snapshot), the PTY session (output/exit/input/interrupt), the
shim↔daemon↔PTY bridge end to end, and the relay client against a mock relay.

## Not yet implemented

- Tray / settings GUI (PySide6) — pairing is shown in the terminal for now.
- SQLite persistence of sessions/events across daemon restarts (in-memory today).
- `mobile.resume` reconnect polish and `terminal.resize` fidelity are best-effort.
