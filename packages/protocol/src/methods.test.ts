import { describe, it, expect } from "vitest";
import {
  MobilePairParamsSchema,
  SessionSubscribeResultSchema,
  DesktopPairingCreateResultSchema,
  MOBILE_FORWARDED_METHODS,
  DESKTOP_EVENTS,
} from "./index.js";

describe("method schemas", () => {
  it("accepts a valid mobile.pair params object", () => {
    const parsed = MobilePairParamsSchema.safeParse({
      desktopId: "desk_123",
      pairingCode: "123456",
      mobileDevice: { id: "mob_abc", name: "Sasha iPhone", platform: "ios" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects mobile.pair params missing pairingCode", () => {
    const parsed = MobilePairParamsSchema.safeParse({
      desktopId: "desk_123",
      mobileDevice: { id: "m", name: "n", platform: "ios" },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a session.subscribe replay result", () => {
    const parsed = SessionSubscribeResultSchema.safeParse({
      session: {
        id: "sess_1",
        agent: "claude",
        title: "Claude",
        command: "claude",
        argv: [],
        cwd: "/tmp",
        status: "running",
        createdAt: "2026-07-11T09:58:00Z",
        lastActivityAt: "2026-07-11T10:00:09Z",
      },
      mode: "replay",
      events: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a desktop.pairing.create result with qrPayload", () => {
    const parsed = DesktopPairingCreateResultSchema.safeParse({
      desktopId: "desk_123",
      pairingCode: "123456",
      expiresAt: "2026-07-11T10:04:05Z",
      qrPayload: {
        relayUrl: "wss://relay.example.test/v1/ws/mobile",
        desktopId: "desk_123",
        pairingCode: "123456",
        expiresAt: "2026-07-11T10:04:05Z",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("routing constants", () => {
  it("forwards the expected mobile methods", () => {
    expect(MOBILE_FORWARDED_METHODS).toContain("session.list");
    expect(MOBILE_FORWARDED_METHODS).toContain("session.input");
    expect(MOBILE_FORWARDED_METHODS).not.toContain("mobile.pair");
  });

  it("lists the desktop events relay forwards to mobile", () => {
    expect(DESKTOP_EVENTS).toContain("terminal.output");
    expect(DESKTOP_EVENTS).toContain("session.ended");
  });
});
