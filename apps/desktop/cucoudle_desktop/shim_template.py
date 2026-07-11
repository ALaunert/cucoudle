"""Source for the transparent CLI shims installed into ``~/.cucoudle/bin``.

A shim is a self-contained Python program (standard library only, so it starts
fast and does not import the daemon package). At runtime it:

1. resolves the real binary for its command name from ``config.json``;
2. execs the real binary directly when the daemon is unavailable, when stdin is
   not a tty, or when already inside a managed session (fallback is mandatory —
   installing Cucoudle must never break normal CLI usage);
3. otherwise connects to the daemon Unix socket, hands over argv/cwd/env/size,
   and bridges the local terminal to the managed PTY.

The tiny frame reader/writer mirrors ``ipc.py`` — keep them in sync.
"""

from __future__ import annotations

import sys

SHIM_SOURCE = r'''
import json
import os
import select
import signal
import socket
import struct
import sys
import termios
import tty

HELLO = 0x01
STDIN = 0x02
RESIZE = 0x03
STDIN_EOF = 0x04
READY = 0x81
STDOUT = 0x82
EXIT = 0x83
ERROR = 0x84

_HEADER = struct.Struct(">BI")

# Interactive TUIs can leave DEC private modes enabled when the daemon/socket
# disappears before the child gets a chance to perform its normal cleanup.
TERMINAL_CLEANUP = (
    b"\x1b[?1000l"  # basic mouse tracking
    b"\x1b[?1002l"  # button-event mouse tracking
    b"\x1b[?1003l"  # any-event mouse tracking
    b"\x1b[?1004l"  # focus reporting
    b"\x1b[?1005l"  # UTF-8 mouse coordinates
    b"\x1b[?1006l"  # SGR mouse coordinates
    b"\x1b[?1015l"  # urxvt mouse coordinates
    b"\x1b[?1016l"  # pixel mouse coordinates
    b"\x1b[?2004l"  # bracketed paste
    b"\x1b[?25h"    # visible cursor
    b"\x1b[0m"      # default character attributes
)


def home_dir():
    override = os.environ.get("CUCOUDLE_HOME")
    if override:
        return os.path.expanduser(override)
    return os.path.join(os.path.expanduser("~"), ".cucoudle")


def load_config():
    path = os.path.join(home_dir(), "config.json")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def find_on_path(tool, exclude_dir):
    for entry in os.environ.get("PATH", "").split(os.pathsep):
        if not entry or os.path.abspath(entry) == os.path.abspath(exclude_dir):
            continue
        candidate = os.path.join(entry, tool)
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def resolve_real_binary(tool, config):
    real = config.get("realBinaries", {}).get(tool)
    if real and os.path.exists(real):
        return real
    return find_on_path(tool, os.path.join(home_dir(), "bin"))


def exec_real(real, argv):
    if not real:
        sys.stderr.write("cucoudle: no real binary found for this command\n")
        sys.exit(127)
    try:
        os.execv(real, [real] + argv)
    except OSError as exc:
        sys.stderr.write("cucoudle: failed to exec %s: %s\n" % (real, exc))
        sys.exit(127)


def get_winsize(fd):
    try:
        packed = struct.pack("HHHH", 0, 0, 0, 0)
        res = __import__("fcntl").ioctl(fd, termios.TIOCGWINSZ, packed)
        rows, cols, _, _ = struct.unpack("HHHH", res)
        if rows and cols:
            return cols, rows
    except Exception:
        pass
    return 80, 24


def frame(ftype, payload=b""):
    return _HEADER.pack(ftype, len(payload)) + payload


def frame_json(ftype, obj):
    return frame(ftype, json.dumps(obj).encode("utf-8"))


def restore_terminal(stdin_fd, stdout_fd, old_attrs):
    try:
        termios.tcsetattr(stdin_fd, termios.TCSADRAIN, old_attrs)
    except (OSError, termios.error):
        pass
    try:
        os.write(stdout_fd, TERMINAL_CLEANUP)
    except OSError:
        pass


def main():
    argv0 = os.path.basename(sys.argv[0])
    args = sys.argv[1:]
    config = load_config()
    real = resolve_real_binary(argv0, config)

    # Nested invocation inside a managed PTY, or non-interactive use: run direct.
    if os.environ.get("CUCOUDLE_MANAGED") == "1":
        exec_real(real, args)
    if not (sys.stdin.isatty() and sys.stdout.isatty()):
        exec_real(real, args)

    sock_path = os.path.join(home_dir(), "daemon.sock")
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        sock.connect(sock_path)
    except OSError:
        exec_real(real, args)  # daemon down -> transparent fallback

    stdin_fd = sys.stdin.fileno()
    stdout_fd = sys.stdout.fileno()
    cols, rows = get_winsize(stdout_fd)

    hello = {
        "tool": argv0,
        "argv": args,
        "cwd": os.getcwd(),
        "env": dict(os.environ),
        "cols": cols,
        "rows": rows,
    }
    sock.sendall(frame_json(HELLO, hello))

    old_attrs = termios.tcgetattr(stdin_fd)
    exit_code = 0
    fatal_fallback = False

    def on_winch(signum, frame_obj):
        c, r = get_winsize(stdout_fd)
        try:
            sock.sendall(frame_json(RESIZE, {"cols": c, "rows": r}))
        except OSError:
            pass

    try:
        tty.setraw(stdin_fd)
        signal.signal(signal.SIGWINCH, on_winch)
        buf = bytearray()
        header = None
        running = True
        while running:
            rlist, _, _ = select.select([sock, stdin_fd], [], [])
            if stdin_fd in rlist:
                data = os.read(stdin_fd, 65536)
                if data:
                    sock.sendall(frame(STDIN, data))
                else:
                    sock.sendall(frame(STDIN_EOF))
            if sock in rlist:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                buf.extend(chunk)
                while True:
                    if header is None:
                        if len(buf) < _HEADER.size:
                            break
                        header = _HEADER.unpack_from(buf, 0)
                        del buf[:_HEADER.size]
                    ftype, length = header
                    if len(buf) < length:
                        break
                    payload = bytes(buf[:length])
                    del buf[:length]
                    header = None
                    if ftype == STDOUT:
                        os.write(stdout_fd, payload)
                    elif ftype == EXIT:
                        try:
                            exit_code = json.loads(payload).get("exitCode", 0) or 0
                        except Exception:
                            exit_code = 0
                        running = False
                        break
                    elif ftype == ERROR:
                        msg = ""
                        try:
                            msg = json.loads(payload).get("message", "")
                        except Exception:
                            pass
                        sys.stderr.write("\r\ncucoudle: %s\r\n" % msg)
                        fatal_fallback = True
                        running = False
                        break
                    # READY and unknown frames are ignored.
    finally:
        restore_terminal(stdin_fd, stdout_fd, old_attrs)
        try:
            sock.close()
        except OSError:
            pass

    if fatal_fallback:
        exec_real(real, args)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
'''


def render_shim(interpreter: str | None = None) -> str:
    """Return the full shim file content with a shebang for *interpreter*.

    Defaults to a portable ``/usr/bin/env python3`` so the shim is not tied to a
    specific (possibly temporary) interpreter path such as a virtualenv. The
    shim body uses only the standard library, so any Python 3 works.
    """
    interpreter = interpreter or "/usr/bin/env python3"
    return f"#!{interpreter}\n{SHIM_SOURCE.lstrip()}"
