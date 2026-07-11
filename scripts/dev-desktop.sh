#!/usr/bin/env bash
#
# One-command local desktop for demoing Cucoudle from a phone.
#
#   scripts/dev-desktop.sh [tool]
#
# It: creates a venv + installs the daemon's deps, starts the desktop daemon
# (pointed at the production relay by default), spawns one managed session, and
# prints the pairing QR. Then just run the mobile app:
#
#   (cd apps/mobile && npm install && npx expo start --tunnel)
#
# Scan the Metro QR in Expo Go, then scan the pairing QR this script prints.
#
# Args:
#   tool   command to run as the demo session (default: bash; pass "claude" for the real agent)
# Env:
#   CUCOUDLE_RELAY_URL   override relay (default: desktop built-in wss://relay.launert.dev)
#   CUCOUDLE_HOME        desktop home dir (default: ~/.cucoudle)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

TOOL="${1:-bash}"
VENV="$REPO/.dev-venv"
PY="$VENV/bin/python"
LOG="$REPO/.dev-desktop.log"
export CUCOUDLE_HOME="${CUCOUDLE_HOME:-$HOME/.cucoudle}"
export PYTHONPATH="$REPO/apps/desktop"
SOCK="$CUCOUDLE_HOME/daemon.sock"

echo "==> repo:  $REPO"
echo "==> relay: ${CUCOUDLE_RELAY_URL:-<desktop default: wss://relay.launert.dev>}"
echo "==> home:  $CUCOUDLE_HOME"
echo "==> logs:  $LOG"

# 1. venv + deps (once)
if [ ! -x "$PY" ]; then
  echo "==> creating venv + installing daemon deps (first run only)"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q "pydantic>=2.6" "websockets>=12.0" "qrcode>=7.4" "pyte>=0.8.2"
fi
# deps added after the venv was first created
"$PY" -c "import pyte" 2>/dev/null || "$VENV/bin/pip" install -q "pyte>=0.8.2"

# 2. start the daemon (logs to file so the QR stays readable)
echo "==> starting desktop daemon"
: > "$LOG"
"$PY" -m cucoudle_desktop daemon >>"$LOG" 2>&1 &
DAEMON_PID=$!
HOLDER_PID=""

cleanup() {
  echo; echo "==> stopping daemon + session"
  [ -n "$HOLDER_PID" ] && kill "$HOLDER_PID" 2>/dev/null || true
  kill "$DAEMON_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# 3. wait for the daemon socket
for _ in $(seq 1 50); do [ -S "$SOCK" ] && break; sleep 0.2; done
if [ ! -S "$SOCK" ]; then echo "!! daemon socket never appeared; see $LOG"; exit 1; fi

# 4. spawn one managed session and hold it open (survives, controllable from the phone)
echo "==> spawning demo session: $TOOL"
CUCOUDLE_TOOL="$TOOL" "$PY" - >>"$LOG" 2>&1 <<'PY' &
import os, socket, struct, json
home = os.environ["CUCOUDLE_HOME"]; tool = os.environ.get("CUCOUDLE_TOOL", "bash")
s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
s.connect(os.path.join(home, "daemon.sock"))
def frame(t, p=b""): return struct.pack(">BI", t, len(p)) + p
s.sendall(frame(0x01, json.dumps({"tool": tool, "argv": [], "cwd": home, "env": {}, "cols": 80, "rows": 24}).encode()))
# Drain output so the daemon never blocks on backpressure; keep the session alive.
while True:
    if not s.recv(65536):
        break
PY
HOLDER_PID=$!

sleep 1.5

# 5. pairing QR
echo "==> pairing code / QR (scan this inside the Cucoudle app):"
echo
"$PY" -m cucoudle_desktop pair || echo "!! pairing failed — check relay connectivity in $LOG"

echo
echo "==> desktop is live; session '$TOOL' is running and steerable from the phone."
echo "==> next:  (cd apps/mobile && npm install && npx expo start --tunnel)"
echo "==> then in Expo Go: scan the Metro QR, then scan the pairing QR above."
echo "==> daemon log:  tail -f $LOG"
echo "==> Ctrl+C to stop."
wait "$DAEMON_PID"
