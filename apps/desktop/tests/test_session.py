import asyncio

import pytest

from cucoudle_desktop.session import GenericPtySession


async def _run_capture(argv, timeout=10.0):
    output = bytearray()
    done = asyncio.Event()
    codes: list = []

    def on_output(data: bytes) -> None:
        output.extend(data)

    def on_exit(code):
        codes.append(code)
        done.set()

    sess = GenericPtySession(argv=argv, cwd="/tmp", env={"TERM": "xterm"},
                             on_output=on_output, on_exit=on_exit)
    sess.start()
    await asyncio.wait_for(done.wait(), timeout)
    return bytes(output), codes[0], sess


@pytest.mark.asyncio
async def test_pty_captures_output_and_exit_code():
    output, code, _ = await _run_capture(["/bin/sh", "-c", "echo hello-cucoudle"])
    assert b"hello-cucoudle" in output
    assert code == 0


@pytest.mark.asyncio
async def test_pty_nonzero_exit():
    _, code, _ = await _run_capture(["/bin/sh", "-c", "exit 7"])
    assert code == 7


@pytest.mark.asyncio
async def test_pty_write_is_echoed():
    output = bytearray()
    done = asyncio.Event()

    def on_output(data: bytes) -> None:
        output.extend(data)
        if b"ping-back" in bytes(output):
            done.set()

    sess = GenericPtySession(argv=["/bin/cat"], cwd="/tmp", env={"TERM": "xterm"},
                             on_output=on_output, on_exit=lambda c: None)
    sess.start()
    await asyncio.sleep(0.2)
    sess.write(b"ping-back\n")
    await asyncio.wait_for(done.wait(), 5)
    assert b"ping-back" in bytes(output)
    sess.terminate()


@pytest.mark.asyncio
async def test_pty_interrupt_stops_process():
    done = asyncio.Event()
    codes: list = []

    def on_exit(code):
        codes.append(code)
        done.set()

    sess = GenericPtySession(argv=["/bin/sh", "-c", "sleep 30"], cwd="/tmp",
                             env={"TERM": "xterm"}, on_output=lambda d: None, on_exit=on_exit)
    sess.start()
    await asyncio.sleep(0.3)
    sess.interrupt()
    await asyncio.wait_for(done.wait(), 5)
    # Killed by SIGINT: Popen reports negative signal number, and never 0.
    assert codes[0] != 0
