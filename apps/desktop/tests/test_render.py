from cucoudle_desktop.render import HISTORY_LIMIT, TerminalRenderer


def text_of(line: list[dict]) -> str:
    return "".join(run["t"] for run in line)


def make() -> TerminalRenderer:
    return TerminalRenderer(cols=40, rows=5)


def test_plain_text_lands_on_screen():
    r = make()
    r.feed(b"hello world")
    frame = r.take_frame("s1")
    assert frame["sessionId"] == "s1"
    assert frame["seq"] == 1
    assert frame["historyAppend"] == []
    assert text_of(frame["screen"][0]) == "hello world"


def test_sgr_colors_become_styled_runs():
    r = make()
    r.feed(b"\x1b[1;31mred\x1b[0m plain")
    line = r.take_frame("s1")["screen"][0]
    assert line[0] == {"t": "red", "fg": "red", "b": True}
    assert line[1]["t"] == " plain"
    assert "fg" not in line[1]


def test_carriage_return_redraw_does_not_grow_history():
    r = make()
    for i in range(50):
        r.feed(f"\rspinner {i}".encode())
    frame = r.take_frame("s1")
    assert frame["historyAppend"] == []
    assert text_of(frame["screen"][0]) == "spinner 49"


def test_scrolled_lines_move_to_history_once():
    r = make()
    r.feed(b"".join(f"line {i}\r\n".encode() for i in range(8)))
    first = r.take_frame("s1")
    # 9 rows used on a 5-row screen -> 4 lines scrolled off.
    assert [text_of(l) for l in first["historyAppend"]] == [
        "line 0", "line 1", "line 2", "line 3",
    ]
    second = r.take_frame("s1")
    assert second["historyAppend"] == []
    assert second["seq"] == 2


def test_snapshot_matches_accumulated_state():
    r = make()
    r.feed(b"".join(f"line {i}\r\n".encode() for i in range(8)))
    r.take_frame("s1")
    snap = r.snapshot()
    assert [text_of(l) for l in snap["history"]] == [
        "line 0", "line 1", "line 2", "line 3",
    ]
    assert text_of(snap["screen"][0]) == "line 4"
    assert snap["lastSeq"] == 1


def test_history_is_capped():
    r = make()
    r.feed(b"".join(f"l{i}\r\n".encode() for i in range(HISTORY_LIMIT + 200)))
    snap = r.snapshot()
    assert len(snap["history"]) == HISTORY_LIMIT


def test_resize_changes_screen_dimensions():
    r = make()
    r.resize(cols=20, rows=3)
    r.feed(b"after resize")
    frame = r.take_frame("s1")
    assert len(frame["screen"]) == 3
    assert text_of(frame["screen"][0]) == "after resize"


def test_private_device_status_query_does_not_break_rendering():
    r = make()
    r.feed(b"before\x1b[?5nafter")
    assert text_of(r.take_frame("s1")["screen"][0]) == "beforeafter"


def test_kitty_keyboard_protocol_is_not_rendered_as_text():
    r = make()
    r.feed(b"hello\x1b[<u\x1b[>1u\x1b[=3;1uworld")
    assert text_of(r.take_frame("s1")["screen"][0]) == "helloworld"


def test_render_filter_handles_control_sequence_split_across_chunks():
    r = make()
    r.feed(b"hello\x1b[?")
    r.feed(b"5nworld\x1b[")
    r.feed(b">1u!")
    assert text_of(r.take_frame("s1")["screen"][0]) == "helloworld!"
