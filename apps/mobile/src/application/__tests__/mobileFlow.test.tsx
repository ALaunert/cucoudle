jest.mock("@cucoudle/protocol", () =>
  jest.requireActual("../../../../../packages/protocol/src/envelope.ts"),
);

import type { EventMessage, Session } from "@cucoudle/protocol";

import type { PairingProfile, PairingResult } from "../../pairing/pairingProfile";
import type { PairingRepository } from "../../pairing/pairingRepository";
import type { MobileClient } from "../../protocol/mobileClient";
import { sessionReducer } from "../../state/sessionReducer";
import { createInitialSessionState } from "../../state/sessionState";
import { createMobileRuntime } from "../createMobileRuntime";

const profile: PairingProfile = {
  relayWsUrl: "wss://relay.example/v1/ws/mobile",
  desktopId: "desktop-1",
  desktopName: "MacBook",
  mobileDeviceId: "mobile-1",
  mobileDeviceName: "iPhone",
  mobilePlatform: "ios",
  mobileSessionToken: "token-1",
  mobileSessionExpiresAt: "2026-07-12T10:00:00.000Z",
};

const session: Session = {
  id: "session-1",
  agent: "codex",
  title: "Mobile flow",
  command: "codex",
  argv: [],
  cwd: "/work/cucoudle",
  status: "running",
  createdAt: "2026-07-11T10:00:00.000Z",
  lastActivityAt: "2026-07-11T12:00:00.000Z",
};

test("runs the paired session flow and never duplicates mutating requests", async () => {
  let state = createInitialSessionState();
  let connectionListener: ((state: "disconnected" | "connecting" | "connected") => void) | undefined;
  let eventListener: ((event: EventMessage) => void) | undefined;
  let subscribeCount = 0;
  const client: MobileClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(() => connectionListener?.("disconnected")),
    request: jest.fn(async (method: string) => {
      if (method === "mobile.resume") {
        return { resumed: true, negotiatedCapabilities: ["interaction.structured"] };
      }
      if (method === "session.list") return { sessions: [session] };
      if (method === "session.subscribe") {
        subscribeCount += 1;
        return subscribeCount === 1
          ? { session, mode: "snapshot", terminalBuffer: "snapshot\n", lastSeq: 4 }
          : { session, mode: "replay", events: [] };
      }
      if (method === "session.input") return { accepted: true, bytesWritten: 9 };
      if (method === "session.interrupt") return { accepted: true };
      return {};
    }) as unknown as MobileClient["request"],
    onEvent: jest.fn((listener) => {
      eventListener = listener;
      return jest.fn();
    }),
    onConnection: jest.fn((listener) => {
      connectionListener = listener;
      return jest.fn();
    }),
  };
  const pairResult: PairingResult = {
    desktopId: "desktop-1",
    desktopName: "MacBook",
    paired: true,
    mobileSessionToken: "token-1",
    mobileSessionExpiresAt: "2026-07-12T10:00:00.000Z",
  };
  const pairingClient: MobileClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    request: jest.fn().mockResolvedValue(pairResult) as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn(() => jest.fn()),
  };
  const repository: PairingRepository = {
    get: jest.fn().mockResolvedValue(profile),
    replace: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const runtime = createMobileRuntime({
    client,
    pairingClient,
    profileRepository: repository,
    navigation,
    dispatch(action) {
      state = sessionReducer(state, action);
    },
    getOpenSession() {
      const sessionId = state.openSessionId;
      if (!sessionId) return undefined;
      return { sessionId, afterSeq: state.terminalBySessionId[sessionId]?.lastSeq };
    },
  });

  await expect(runtime.pair({
    relayWsUrl: profile.relayWsUrl,
    desktopId: profile.desktopId,
    pairingCode: "123456",
    mobileDevice: { id: "mobile-1", name: "iPhone", platform: "ios" },
  })).resolves.toEqual(pairResult);
  await runtime.start(profile);
  expect(state.sessionIds).toEqual(["session-1"]);

  await runtime.openSession("session-1");
  expect(navigation.push).toHaveBeenCalledWith("/session/session-1");
  expect(state.terminalBySessionId["session-1"]).toEqual({ text: "snapshot\n", lastSeq: 4 });

  eventListener?.({
    version: "2026-07-11",
    kind: "event",
    event: "terminal.output",
    data: { sessionId: "session-1", seq: 5, data: "live\n" },
    sentAt: "2026-07-11T12:01:00.000Z",
  });
  expect(state.terminalBySessionId["session-1"].text).toBe("snapshot\nlive\n");

  await runtime.sendInput({ sessionId: "session-1", inputMode: "text", data: "continue\n" });
  await runtime.interrupt({ sessionId: "session-1" });
  eventListener?.({
    version: "2026-07-11",
    kind: "event",
    event: "session.ended",
    data: { sessionId: "session-1", exitCode: 0 },
    sentAt: "2026-07-11T12:02:00.000Z",
  });
  expect(state.sessionsById["session-1"].status).toBe("stopped");

  await runtime.retry();
  expect(subscribeCount).toBe(2);
  expect(client.request).toHaveBeenCalledWith("session.subscribe", {
    sessionId: "session-1",
    afterSeq: 5,
  });
  expect((client.request as jest.Mock).mock.calls.filter(([method]) => method === "session.input")).toHaveLength(1);
  expect((client.request as jest.Mock).mock.calls.filter(([method]) => method === "session.interrupt")).toHaveLength(1);

  runtime.dispose();
  expect(pairingClient.close).toHaveBeenCalled();
  expect(client.close).toHaveBeenCalled();
});
