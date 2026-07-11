import { describe, it, expect } from "vitest";
import {
  SessionInputParamsSchema,
  InteractionRequestSchema,
  InteractionRespondParamsSchema,
  SessionSubscribeResultSchema,
  ErrorCodeSchema,
  MOBILE_FORWARDED_METHODS,
  DESKTOP_EVENTS,
} from "./index.js";

describe("session.input modes", () => {
  it("accepts text with submit flag", () => {
    expect(SessionInputParamsSchema.safeParse({ sessionId: "s1", inputMode: "text", data: "hi", submit: true }).success).toBe(true);
  });
  it("accepts raw", () => {
    expect(SessionInputParamsSchema.safeParse({ sessionId: "s1", inputMode: "raw", data: "" }).success).toBe(true);
  });
  it("accepts bytes with base64", () => {
    expect(SessionInputParamsSchema.safeParse({ sessionId: "s1", inputMode: "bytes", dataBase64: "Aw==" }).success).toBe(true);
  });
  it("accepts keys with named key and modifiers", () => {
    const parsed = SessionInputParamsSchema.safeParse({
      sessionId: "s1",
      inputMode: "keys",
      keys: [{ key: "arrowDown" }, { key: { character: "c" }, modifiers: ["ctrl"] }, { key: "enter" }],
    });
    expect(parsed.success).toBe(true);
  });
  it("rejects bytes missing dataBase64", () => {
    expect(SessionInputParamsSchema.safeParse({ sessionId: "s1", inputMode: "bytes" }).success).toBe(false);
  });
  it("rejects an unknown inputMode", () => {
    expect(SessionInputParamsSchema.safeParse({ sessionId: "s1", inputMode: "voice", data: "x" }).success).toBe(false);
  });
});

describe("interaction schemas", () => {
  const interaction = {
    id: "int_42",
    sessionId: "sess_1",
    kind: "approval",
    prompt: "Allow Claude to run npm test?",
    details: "npm test",
    options: [
      { id: "approve_once", label: "Allow once", intent: "approveOnce" },
      { id: "reject", label: "Reject", intent: "reject" },
    ],
    allowsText: true,
    allowsTerminalInput: true,
    createdAt: "2026-07-11T10:02:00Z",
    terminalSeq: 130,
  };

  it("accepts a valid approval InteractionRequest", () => {
    expect(InteractionRequestSchema.safeParse(interaction).success).toBe(true);
  });

  it("rejects allowsTerminalInput other than true", () => {
    expect(InteractionRequestSchema.safeParse({ ...interaction, allowsTerminalInput: false }).success).toBe(false);
  });

  it("accepts an options interaction.respond", () => {
    const parsed = InteractionRespondParamsSchema.safeParse({
      sessionId: "sess_1",
      interactionId: "int_42",
      response: { type: "options", optionIds: ["approve_once"] },
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a text and a cancel interaction.respond", () => {
    expect(InteractionRespondParamsSchema.safeParse({ sessionId: "s", interactionId: "i", response: { type: "text", text: "yes", submit: true } }).success).toBe(true);
    expect(InteractionRespondParamsSchema.safeParse({ sessionId: "s", interactionId: "i", response: { type: "cancel" } }).success).toBe(true);
  });

  it("carries activeInteraction in a subscribe result", () => {
    const parsed = SessionSubscribeResultSchema.safeParse({
      session: { id: "sess_1", agent: "claude", title: "t", command: "claude", argv: [], cwd: "/tmp", status: "waiting", createdAt: "2026-07-11T09:58:00Z", lastActivityAt: "2026-07-11T10:00:09Z" },
      mode: "live",
      activeInteraction: interaction,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("routing and error additions", () => {
  it("adds interaction error codes", () => {
    expect(ErrorCodeSchema.safeParse("INTERACTION_NOT_FOUND").success).toBe(true);
    expect(ErrorCodeSchema.safeParse("INTERACTION_STALE").success).toBe(true);
  });
  it("forwards interaction.respond", () => {
    expect(MOBILE_FORWARDED_METHODS).toContain("interaction.respond");
  });
  it("fans out interaction events", () => {
    expect(DESKTOP_EVENTS).toContain("interaction.requested");
    expect(DESKTOP_EVENTS).toContain("interaction.updated");
    expect(DESKTOP_EVENTS).toContain("interaction.resolved");
  });
});
