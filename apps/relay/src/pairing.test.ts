import { describe, it, expect } from "vitest";
import { RelayState, generatePairingCode } from "./state.js";

const RELAY_URL = "ws://localhost:8787/v1/ws/mobile";
const fakeSocket = () => ({ send: () => {}, close: () => {} }) as unknown as import("@fastify/websocket").WebSocket;

describe("generatePairingCode", () => {
  it("produces a 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePairingCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("RelayState pairing", () => {
  it("consumes a valid, unexpired pairing code once", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const p = s.createPairing("desk_1", 300, RELAY_URL, now);
    const first = s.consumePairing("desk_1", p.pairingCode, now + 1000);
    expect(first).toEqual({ ok: true });
    const second = s.consumePairing("desk_1", p.pairingCode, now + 2000);
    expect(second).toMatchObject({ ok: false, code: "PAIRING_NOT_FOUND" });
  });

  it("rejects an expired pairing code with PAIRING_EXPIRED", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const p = s.createPairing("desk_1", 300, RELAY_URL, now);
    const res = s.consumePairing("desk_1", p.pairingCode, now + 301_000);
    expect(res).toMatchObject({ ok: false, code: "PAIRING_EXPIRED" });
  });

  it("rejects an unknown code with PAIRING_NOT_FOUND", () => {
    const s = new RelayState();
    const res = s.consumePairing("desk_1", "000000", Date.now());
    expect(res).toMatchObject({ ok: false, code: "PAIRING_NOT_FOUND" });
  });

  it("invalidates the previous pairing code for the same desktop", () => {
    const s = new RelayState();
    const now = Date.parse("2026-07-11T10:00:00Z");
    const first = s.createPairing("desk_1", 300, RELAY_URL, now);
    const second = s.createPairing("desk_1", 300, RELAY_URL, now + 1000);

    expect(s.consumePairing("desk_1", first.pairingCode, now + 2000)).toMatchObject({
      ok: false,
      code: "PAIRING_NOT_FOUND",
    });
    expect(s.consumePairing("desk_1", second.pairingCode, now + 2000)).toEqual({ ok: true });
  });

  it("resumes with a valid token and rejects a bad token", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const issued = s.issueMobileSession("desk_1", "mob_a", 3_600_000, now);
    expect(s.resumeMobile("desk_1", "mob_a", issued.token, now + 1000)).toEqual({ ok: true });
    expect(s.resumeMobile("desk_1", "mob_a", "wrong", now + 1000)).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });
});
