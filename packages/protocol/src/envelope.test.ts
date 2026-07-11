import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  parseWireMessage,
  makeResponse,
  makeError,
  makeEvent,
  isRequest,
  isEvent,
} from "./index.js";

describe("parseWireMessage", () => {
  it("accepts a valid request envelope", () => {
    const raw = JSON.stringify({
      version: PROTOCOL_VERSION,
      kind: "request",
      id: "req_1",
      method: "session.list",
      params: {},
      sentAt: "2026-07-11T10:00:00Z",
    });
    const res = parseWireMessage(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(isRequest(res.msg)).toBe(true);
  });

  it("rejects non-JSON with INVALID_MESSAGE", () => {
    const res = parseWireMessage("not json{");
    expect(res).toEqual({ ok: false, code: "INVALID_MESSAGE", message: expect.any(String) });
  });

  it("rejects a wrong protocol version with UNSUPPORTED_PROTOCOL", () => {
    const raw = JSON.stringify({
      version: "1999-01-01",
      kind: "request",
      id: "req_1",
      method: "session.list",
      sentAt: "2026-07-11T10:00:00Z",
    });
    const res = parseWireMessage(raw);
    expect(res).toMatchObject({ ok: false, code: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects a structurally invalid envelope with INVALID_MESSAGE", () => {
    const raw = JSON.stringify({ version: PROTOCOL_VERSION, kind: "request" });
    const res = parseWireMessage(raw);
    expect(res).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });
});

describe("builders", () => {
  it("makeResponse reuses id and sets ok true", () => {
    const r = makeResponse("req_9", { sessions: [] });
    expect(r).toMatchObject({ kind: "response", id: "req_9", ok: true, result: { sessions: [] } });
    expect(r.version).toBe(PROTOCOL_VERSION);
  });

  it("makeError sets ok false and carries the code", () => {
    const r = makeError("req_9", "DESKTOP_OFFLINE", "desktop is offline");
    expect(r).toMatchObject({ kind: "response", id: "req_9", ok: false, error: { code: "DESKTOP_OFFLINE" } });
  });

  it("makeEvent has no id and is an event", () => {
    const e = makeEvent("terminal.output", { sessionId: "s1", seq: 1, data: "hi" });
    expect(isEvent(e)).toBe(true);
    expect(e).not.toHaveProperty("id");
  });
});
