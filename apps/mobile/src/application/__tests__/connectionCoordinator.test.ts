import type { Session } from "@cucoudle/protocol";

import type { PairingProfile } from "../../pairing/pairingProfile";
import type { MobileClient } from "../../protocol/mobileClient";
import type { SessionAction } from "../../state/sessionState";
import {
  createConnectionCoordinator,
  type ConnectionCoordinatorDependencies,
} from "../connectionCoordinator";

const profile: PairingProfile = {
  relayWsUrl: "wss://relay.cucoudle.dev/v1/ws/mobile",
  desktopId: "desktop-1",
  desktopName: "Рабочий Mac",
  mobileDeviceId: "mobile-1",
  mobileDeviceName: "iPhone",
  mobilePlatform: "ios",
  mobileSessionToken: "secret",
  mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
};

const session = {
  id: "session-1",
  title: "Codex",
  status: "running",
} as Session;

function protocolError(code: string) {
  return Object.assign(new Error(code), { code });
}

function harness(overrides: Partial<ConnectionCoordinatorDependencies> = {}) {
  const calls: Array<[string, unknown?]> = [];
  const transportOperations: Array<[string, unknown?]> = [];
  let connectionListener: ((state: "disconnected" | "connecting" | "connected") => void) | undefined;
  const client: MobileClient = {
    connect: jest.fn(async (url: string) => {
      transportOperations.push(["connect", url]);
      calls.push(["connect", url]);
    }),
    close: jest.fn(() => {
      transportOperations.push(["close"]);
      connectionListener?.("disconnected");
    }),
    request: jest.fn(async (method: string, params: Record<string, unknown>) => {
      calls.push([method, params]);
      if (method === "mobile.resume") {
        return {
          desktopId: profile.desktopId,
          desktopName: profile.desktopName,
          resumed: true,
          negotiatedCapabilities: ["terminal.input", "interaction.structured"],
        };
      }
      if (method === "session.list") return { sessions: [session] };
      return { session, mode: "live", lastSeq: 12 };
    }) as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn((listener) => {
      connectionListener = listener;
      return jest.fn();
    }),
  };
  const actions: SessionAction[] = [];
  const statuses: string[] = [];
  const invalidated: PairingProfile[] = [];
  const deps: ConnectionCoordinatorDependencies = {
    client,
    dispatch: (action) => actions.push(action),
    getOpenSession: () => ({ sessionId: session.id, afterSeq: 9 }),
    onStatusChange: (status) => statuses.push(status),
    onProfileInvalidated: (value) => {
      invalidated.push(value);
    },
    reconnectDelayMs: 100,
    ...overrides,
  };
  const coordinator = createConnectionCoordinator(deps);
  return {
    actions,
    calls,
    client,
    coordinator,
    emitConnection: (state: "disconnected" | "connecting" | "connected") => connectionListener?.(state),
    invalidated,
    statuses,
    transportOperations,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

test("connects to the exact profile relay then resumes, replaces the list, and restores the open subscription", async () => {
  const h = harness();

  await h.coordinator.start(profile);

  expect(h.calls).toEqual([
    ["connect", profile.relayWsUrl],
    ["mobile.resume", {
      desktopId: profile.desktopId,
      mobileDeviceId: profile.mobileDeviceId,
      mobileSessionToken: profile.mobileSessionToken,
      offeredCapabilities: ["interaction.structured"],
    }],
    ["session.list", {}],
    ["session.subscribe", { sessionId: session.id, afterSeq: 9 }],
  ]);
  expect(h.actions).toEqual([
    { type: "session/listReceived", sessions: [session] },
    {
      type: "session/subscribeReceived",
      result: { session, mode: "live", lastSeq: 12 },
    },
  ]);
  expect(h.coordinator.getSnapshot()).toMatchObject({ status: "online", canMutate: true, profile });
  expect([...h.coordinator.getSnapshot().negotiatedCapabilities!]).toEqual([
    "terminal.input",
    "interaction.structured",
  ]);
});

test("a transient close keeps the profile, disables mutations, and deterministically resyncs cached state", async () => {
  const h = harness();
  await h.coordinator.start(profile);
  h.calls.length = 0;
  h.actions.length = 0;

  h.emitConnection("disconnected");

  expect(h.coordinator.getSnapshot()).toMatchObject({
    status: "reconnecting",
    canMutate: false,
    profile,
  });
  expect(h.actions).toEqual([]);
  await jest.advanceTimersByTimeAsync(99);
  expect(h.calls).toEqual([]);
  await jest.advanceTimersByTimeAsync(1);
  expect(h.calls.map(([method]) => method)).toEqual([
    "connect",
    "mobile.resume",
    "session.list",
    "session.subscribe",
  ]);
  expect(h.coordinator.getSnapshot().status).toBe("online");
});

test.each(["DESKTOP_OFFLINE", "DAEMON_UNAVAILABLE"])(
  "%s enters recovery without discarding the profile",
  async (code) => {
    const client = harness().client;
    (client.request as jest.Mock).mockRejectedValue(protocolError(code));
    const h = harness({ client });

    await h.coordinator.start(profile);

    expect(h.coordinator.getSnapshot()).toMatchObject({ status: "recovery", profile, canMutate: false });
    expect(h.invalidated).toEqual([]);
    await jest.runAllTimersAsync();
    expect(client.connect).toHaveBeenCalledTimes(1);
  },
);

test.each(["UNAUTHORIZED", "PAIRING_EXPIRED", "PAIRING_NOT_FOUND", "MOBILE_NOT_PAIRED"])(
  "%s invalidates the unusable profile and requires pairing",
  async (code) => {
    const client = harness().client;
    (client.request as jest.Mock).mockRejectedValue(protocolError(code));
    const h = harness({ client });

    await h.coordinator.start(profile);

    expect(h.coordinator.getSnapshot()).toMatchObject({
      status: "pairingRequired",
      profile: null,
      canMutate: false,
    });
    expect(h.invalidated).toEqual([profile]);
  },
);

test("explicit retry leaves recovery immediately and retries only recovery-safe protocol methods", async () => {
  let fail = true;
  const h = harness();
  (h.client.request as jest.Mock).mockImplementation(async (method, params) => {
    h.calls.push([method, params]);
    if (fail) throw protocolError("DESKTOP_OFFLINE");
    if (method === "session.list") return { sessions: [session] };
    if (method === "session.subscribe") return { session, mode: "live" };
    return { desktopId: profile.desktopId, desktopName: profile.desktopName, resumed: true };
  });
  await h.coordinator.start(profile);
  h.calls.length = 0;
  fail = false;

  await h.coordinator.retry();

  expect(h.calls.map(([method]) => method)).toEqual([
    "connect",
    "mobile.resume",
    "session.list",
    "session.subscribe",
  ]);
  const protocolMethods = h.calls
    .map(([method]) => method)
    .filter((method) => method !== "connect");
  const recoverySafeMethods = new Set([
    "mobile.resume",
    "session.list",
    "session.subscribe",
  ]);
  expect(protocolMethods.every((method) => recoverySafeMethods.has(method))).toBe(true);
  for (const mutatingMethod of [
    "session.input",
    "session.interrupt",
    "interaction.respond",
  ]) {
    expect(protocolMethods).not.toContain(mutatingMethod);
  }
});

test("retry after resume recovery replaces the active transport without a competing reconnect", async () => {
  const h = harness();
  let resumeAttempts = 0;
  (h.client.request as jest.Mock).mockImplementation(async (method) => {
    h.calls.push([method, {}]);
    if (method === "mobile.resume" && resumeAttempts++ === 0) {
      throw protocolError("DESKTOP_OFFLINE");
    }
    if (method === "session.list") return { sessions: [session] };
    if (method === "session.subscribe") return { session, mode: "live" };
    return { resumed: true };
  });
  await h.coordinator.start(profile);

  await h.coordinator.retry();
  await jest.runAllTimersAsync();

  expect(h.transportOperations).toEqual([
    ["connect", profile.relayWsUrl],
    ["close"],
    ["connect", profile.relayWsUrl],
  ]);
  expect(h.actions).toEqual([
    { type: "session/listReceived", sessions: [session] },
    { type: "session/subscribeReceived", result: { session, mode: "live" } },
  ]);
  expect(resumeAttempts).toBe(2);
});

test("replaces negotiated capabilities rather than unioning successive server results", async () => {
  const h = harness();
  await h.coordinator.start(profile);
  (h.client.request as jest.Mock).mockImplementation(async (method) => {
    if (method === "mobile.resume") {
      return { resumed: true, negotiatedCapabilities: ["terminal.resize"] };
    }
    if (method === "session.list") return { sessions: [session] };
    return { session, mode: "live" };
  });

  await h.coordinator.retry();

  expect([...h.coordinator.getSnapshot().negotiatedCapabilities!]).toEqual(["terminal.resize"]);
});

test("does not carry negotiated capabilities into a connection whose runtime omits the field", async () => {
  const h = harness();
  await h.coordinator.start(profile);
  (h.client.request as jest.Mock).mockImplementation(async (method) => {
    if (method === "mobile.resume") return { resumed: true };
    if (method === "session.list") return { sessions: [session] };
    return { session, mode: "live" };
  });

  await h.coordinator.retry();

  expect(h.coordinator.getSnapshot().negotiatedCapabilities).toBeUndefined();
});

test("a recovery state waits for explicit retry even if the socket also closes", async () => {
  const h = harness();
  (h.client.request as jest.Mock).mockRejectedValue(protocolError("DESKTOP_OFFLINE"));
  await h.coordinator.start(profile);
  h.emitConnection("disconnected");

  await jest.runAllTimersAsync();

  expect(h.coordinator.getSnapshot().status).toBe("recovery");
  expect(h.client.connect).toHaveBeenCalledTimes(1);
});

test("dispose cancels pending reconnect work", async () => {
  const h = harness();
  await h.coordinator.start(profile);
  h.calls.length = 0;
  h.emitConnection("disconnected");

  h.coordinator.dispose();
  await jest.runAllTimersAsync();

  expect(h.calls).toEqual([]);
  expect(h.client.close).toHaveBeenCalledTimes(1);
});
