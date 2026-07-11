import { describe, it, expect } from "vitest";
import {
  DESKTOP_EVENTS,
  SessionSubscribeResultSchema,
  TerminalRenderDataSchema,
  TerminalRenderSnapshotSchema,
} from "./index.js";

describe("terminal.render schemas", () => {
  it("registers terminal.render as a desktop event", () => {
    expect(DESKTOP_EVENTS).toContain("terminal.render");
  });

  it("accepts a valid render frame", () => {
    const parsed = TerminalRenderDataSchema.safeParse({
      sessionId: "sess_1",
      seq: 3,
      historyAppend: [[{ t: "hello", fg: "red", b: true }]],
      screen: [[{ t: "> " }, { t: "spinner", fg: "36a3fa" }], []],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a frame without sessionId", () => {
    const parsed = TerminalRenderDataSchema.safeParse({
      seq: 1,
      historyAppend: [],
      screen: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a subscribe result with terminalRender snapshot", () => {
    const parsed = SessionSubscribeResultSchema.safeParse({
      session: {
        id: "sess_1",
        agent: "claude",
        title: "demo",
        command: "claude",
        argv: ["claude"],
        cwd: "/tmp",
        status: "running",
        createdAt: "2026-07-11T10:00:00Z",
        lastActivityAt: "2026-07-11T10:00:00Z",
      },
      mode: "snapshot",
      terminalBuffer: "raw",
      lastSeq: 10,
      terminalRender: {
        history: [[{ t: "old line" }]],
        screen: [[{ t: "live", u: true }]],
        lastSeq: 4,
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a snapshot with malformed runs", () => {
    const parsed = TerminalRenderSnapshotSchema.safeParse({
      history: [[{ text: "wrong key" }]],
      screen: [],
      lastSeq: 0,
    });
    expect(parsed.success).toBe(false);
  });
});
