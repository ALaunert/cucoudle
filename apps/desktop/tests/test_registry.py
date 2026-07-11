from cucoudle_desktop.protocol import AgentKind, SessionStatus
from cucoudle_desktop.registry import MAX_BUFFER_BYTES, SessionRegistry


def _make(reg: SessionRegistry):
    entry = reg.create(tool="claude", command="claude", argv=[], cwd="/tmp/proj")
    reg.mark_running(entry.session.id)
    return entry


def test_create_sets_metadata():
    reg = SessionRegistry()
    entry = _make(reg)
    assert entry.session.agent == AgentKind.CLAUDE.value
    assert entry.session.status == SessionStatus.RUNNING.value
    assert entry.session.title.startswith("Claude")
    assert "proj" in entry.session.title


def test_seq_is_monotonic_across_sessions():
    reg = SessionRegistry()
    a = _make(reg)
    b = _make(reg)
    s1 = reg.record_output(a.session.id, "one")
    s2 = reg.record_output(b.session.id, "two")
    s3 = reg.record_output(a.session.id, "three")
    assert [s1, s2, s3] == [1, 2, 3]


def test_subscribe_live_when_no_output():
    reg = SessionRegistry()
    entry = _make(reg)
    view = reg.subscribe_view(entry.session.id, after_seq=None)
    assert view["mode"] == "live"


def test_subscribe_snapshot_on_fresh_open_with_history():
    reg = SessionRegistry()
    entry = _make(reg)
    reg.record_output(entry.session.id, "hello ")
    reg.record_output(entry.session.id, "world")
    view = reg.subscribe_view(entry.session.id, after_seq=None)
    assert view["mode"] == "snapshot"
    assert view["terminalBuffer"] == "hello world"
    assert view["lastSeq"] == 2


def test_subscribe_replay_after_seq():
    reg = SessionRegistry()
    entry = _make(reg)
    reg.record_output(entry.session.id, "a")  # seq 1
    reg.record_output(entry.session.id, "b")  # seq 2
    reg.record_output(entry.session.id, "c")  # seq 3
    view = reg.subscribe_view(entry.session.id, after_seq=1)
    assert view["mode"] == "replay"
    assert [e["data"] for e in view["events"]] == ["b", "c"]
    assert [e["seq"] for e in view["events"]] == [2, 3]


def test_subscribe_live_when_caught_up():
    reg = SessionRegistry()
    entry = _make(reg)
    reg.record_output(entry.session.id, "a")
    view = reg.subscribe_view(entry.session.id, after_seq=1)
    assert view["mode"] == "live"


def test_subscribe_snapshot_when_past_buffer_window():
    reg = SessionRegistry()
    entry = _make(reg)
    # Overflow the byte budget so early chunks are evicted.
    chunk = "x" * 4096
    total = MAX_BUFFER_BYTES // len(chunk) + 5
    for _ in range(total):
        reg.record_output(entry.session.id, chunk)
    # afterSeq=1 is now before the earliest retained chunk -> snapshot.
    view = reg.subscribe_view(entry.session.id, after_seq=1)
    assert view["mode"] == "snapshot"
    assert entry.buffered_bytes <= MAX_BUFFER_BYTES


def test_subscribe_unknown_session():
    reg = SessionRegistry()
    assert reg.subscribe_view("sess_missing", after_seq=None) is None


def test_mark_ended_sets_exit_code():
    reg = SessionRegistry()
    entry = _make(reg)
    reg.mark_ended(entry.session.id, 3)
    assert entry.session.status == SessionStatus.STOPPED.value
    assert entry.session.exitCode == 3
