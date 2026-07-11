"""``GenericPtySession``: a real CLI process running inside a managed PTY.

The daemon owns the master side of the pty. Output read from the master is
fanned out by the daemon to (1) the local terminal via the shim socket and
(2) the relay. Input from either side is written back into the master.

This uses only the standard library (``os``/``pty``/``fcntl``/``termios``) so
the desktop app has no native build dependency during the hackathon.
"""

from __future__ import annotations

import asyncio
import fcntl
import os
import signal
import struct
import subprocess
import termios
from collections.abc import Awaitable, Callable
from typing import Optional

OutputCallback = Callable[[bytes], None]
ExitCallback = Callable[[Optional[int]], Awaitable[None] | None]


class GenericPtySession:
    """Launch and manage a single child process attached to a pseudo-terminal."""

    def __init__(
        self,
        argv: list[str],
        cwd: str,
        env: dict[str, str],
        cols: int = 80,
        rows: int = 24,
        on_output: OutputCallback | None = None,
        on_exit: ExitCallback | None = None,
    ) -> None:
        self.argv = argv
        self.cwd = cwd
        self.env = env
        self.cols = cols
        self.rows = rows
        self.on_output = on_output
        self.on_exit = on_exit

        self._master_fd: int | None = None
        self._proc: subprocess.Popen | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._exited = False
        self.exit_code: int | None = None

    @property
    def pid(self) -> int | None:
        return self._proc.pid if self._proc else None

    @property
    def running(self) -> bool:
        return self._proc is not None and not self._exited

    @staticmethod
    def _child_preexec() -> None:
        # Runs in the forked child before exec: start a new session and claim
        # the slave (fd 0) as the controlling terminal so the pty line
        # discipline delivers Ctrl+C typed locally as SIGINT to this process.
        os.setsid()
        tiocsctty = getattr(termios, "TIOCSCTTY", None)
        if tiocsctty is not None:
            try:
                fcntl.ioctl(0, tiocsctty, 0)
            except OSError:
                pass

    def start(self) -> None:
        """Fork the child on a fresh pty and begin streaming output."""
        self._loop = asyncio.get_running_loop()
        master_fd, slave_fd = os.openpty()
        self._master_fd = master_fd
        self._set_winsize(self.rows, self.cols)
        try:
            self._proc = subprocess.Popen(
                self.argv,
                cwd=self.cwd or None,
                env=self.env,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                preexec_fn=self._child_preexec,  # new session + controlling tty
                close_fds=True,
            )
        finally:
            os.close(slave_fd)  # parent keeps only the master side
        # Non-blocking master reads driven by the event loop.
        os.set_blocking(master_fd, False)
        self._loop.add_reader(master_fd, self._on_readable)

    # ---- io ------------------------------------------------------------
    def _on_readable(self) -> None:
        assert self._master_fd is not None
        try:
            data = os.read(self._master_fd, 65536)
        except (BlockingIOError, InterruptedError):
            return
        except OSError:
            # EIO on the master fd means the child closed the slave (exited).
            data = b""
        if not data:
            self._finalize()
            return
        if self.on_output is not None:
            self.on_output(data)

    def write(self, data: bytes) -> None:
        """Write bytes into the pty (stdin of the child)."""
        if self._master_fd is None or self._exited:
            raise OSError("session is not running")
        os.write(self._master_fd, data)

    def resize(self, cols: int, rows: int) -> None:
        self.cols, self.rows = cols, rows
        if self._master_fd is not None and not self._exited:
            self._set_winsize(rows, cols)

    def _set_winsize(self, rows: int, cols: int) -> None:
        if self._master_fd is None:
            return
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(self._master_fd, termios.TIOCSWINSZ, winsize)

    def interrupt(self) -> None:
        """Deliver SIGINT (Ctrl+C) to the child's process group."""
        self._signal_group(signal.SIGINT)

    def terminate(self) -> None:
        self._signal_group(signal.SIGTERM)

    def _signal_group(self, sig: int) -> None:
        if self._proc is None or self._exited:
            return
        try:
            os.killpg(os.getpgid(self._proc.pid), sig)
        except ProcessLookupError:
            pass

    # ---- lifecycle -----------------------------------------------------
    def _finalize(self) -> None:
        if self._exited:
            return
        self._exited = True
        if self._master_fd is not None and self._loop is not None:
            try:
                self._loop.remove_reader(self._master_fd)
            except ValueError:  # pragma: no cover - loop already closed
                pass
            try:
                os.close(self._master_fd)
            except OSError:  # pragma: no cover
                pass
        code = self._reap()
        self.exit_code = code
        if self.on_exit is not None and self._loop is not None:
            result = self.on_exit(code)
            if asyncio.iscoroutine(result):
                self._loop.create_task(result)

    def _reap(self) -> int | None:
        if self._proc is None:
            return None
        try:
            return self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:  # pragma: no cover - defensive
            self._proc.kill()
            return self._proc.wait()
