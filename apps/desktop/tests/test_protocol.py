import json

from cucoudle_desktop.protocol import (
    PROTOCOL_VERSION,
    AgentKind,
    ErrorCode,
    EventMessage,
    RequestMessage,
    ResponseMessage,
    classify_agent,
    dump,
    make_error,
    make_event,
    make_request,
    make_response,
    parse_envelope,
)


def test_request_roundtrip():
    req = make_request("session.list", {"foo": 1}, "req_1")
    raw = dump(req)
    parsed = parse_envelope(raw)
    assert isinstance(parsed, RequestMessage)
    assert parsed.id == "req_1"
    assert parsed.method == "session.list"
    assert parsed.params == {"foo": 1}
    assert parsed.version == PROTOCOL_VERSION


def test_response_reuses_id():
    resp = make_response("req_9", {"accepted": True})
    assert resp.id == "req_9"
    assert resp.ok is True
    parsed = parse_envelope(dump(resp))
    assert isinstance(parsed, ResponseMessage)
    assert parsed.result == {"accepted": True}


def test_error_response_shape():
    resp = make_error("req_2", ErrorCode.SESSION_NOT_FOUND, "nope")
    data = json.loads(dump(resp))
    assert data["ok"] is False
    assert data["error"]["code"] == "SESSION_NOT_FOUND"
    assert data["error"]["message"] == "nope"


def test_event_roundtrip():
    ev = make_event("terminal.output", {"sessionId": "s", "seq": 3, "data": "hi"})
    parsed = parse_envelope(dump(ev))
    assert isinstance(parsed, EventMessage)
    assert parsed.event == "terminal.output"
    assert parsed.data["seq"] == 3


def test_parse_rejects_unknown_kind():
    try:
        parse_envelope(json.dumps({"kind": "bogus"}))
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_dump_excludes_none():
    # A successful response should not carry a null error field on the wire.
    resp = make_response("req_1", {"ok": 1})
    assert "error" not in json.loads(dump(resp))


def test_classify_agent():
    assert classify_agent("claude") == AgentKind.CLAUDE
    assert classify_agent("codex") == AgentKind.CODEX
    assert classify_agent("agent") == AgentKind.CURSOR
    assert classify_agent("cursor") == AgentKind.CURSOR
    assert classify_agent("bash") == AgentKind.SHELL
    assert classify_agent("weird") == AgentKind.UNKNOWN
