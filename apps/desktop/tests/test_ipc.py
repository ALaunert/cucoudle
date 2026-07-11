import asyncio

import pytest

from cucoudle_desktop import ipc


def test_encode_decode_roundtrip():
    dec = ipc.FrameDecoder()
    frames = dec.feed(ipc.encode(ipc.STDOUT, b"hello world"))
    assert len(frames) == 1
    assert frames[0].type == ipc.STDOUT
    assert frames[0].payload == b"hello world"


def test_encode_json():
    dec = ipc.FrameDecoder()
    frames = dec.feed(ipc.encode_json(ipc.HELLO, {"tool": "claude", "cols": 100}))
    assert frames[0].type == ipc.HELLO
    assert frames[0].json() == {"tool": "claude", "cols": 100}


def test_decoder_handles_split_and_multiple_frames():
    dec = ipc.FrameDecoder()
    blob = ipc.encode(ipc.STDIN, b"abc") + ipc.encode(ipc.STDIN, b"defgh")
    # Feed one byte at a time to prove incremental reassembly.
    collected = []
    for byte in blob:
        collected.extend(dec.feed(bytes([byte])))
    assert [f.payload for f in collected] == [b"abc", b"defgh"]


def test_empty_payload_frame():
    dec = ipc.FrameDecoder()
    frames = dec.feed(ipc.encode(ipc.STDIN_EOF))
    assert frames[0].type == ipc.STDIN_EOF
    assert frames[0].payload == b""


@pytest.mark.asyncio
async def test_read_frame_from_stream():
    reader = asyncio.StreamReader()
    reader.feed_data(ipc.encode(ipc.STDOUT, b"chunk"))
    reader.feed_eof()
    frame = await ipc.read_frame(reader)
    assert frame is not None
    assert frame.type == ipc.STDOUT
    assert frame.payload == b"chunk"
    # Clean EOF -> None.
    assert await ipc.read_frame(reader) is None
