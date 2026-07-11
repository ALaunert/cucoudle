import { Text } from "react-native";
import { act, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@cucoudle/protocol", () => {
  const { z } = require("zod") as typeof import("zod");
  return {
    PROTOCOL_VERSION: "2026-07-11",
    parseWireMessage: jest.fn(() => ({
      ok: false,
      id: "",
      code: "INVALID_MESSAGE",
      message: "invalid",
    })),
    MobileDeviceSchema: z.object({
      id: z.string(),
      name: z.string(),
      platform: z.enum(["ios", "android", "unknown"]),
    }),
  };
});

import type { PairingProfile } from "../../pairing/pairingProfile";
import type { PairingRepository } from "../../pairing/pairingRepository";
import type { MobileClient } from "../../protocol/mobileClient";
import { AppProvider } from "../AppProvider";
import { useApp } from "../useApp";
import NewRoute from "../../app/(tabs)/new";
import SettingsRoute from "../../app/(tabs)/settings";
import SessionRoute from "../../app/session/[id]";
import RecoveryRoute from "../../app/recovery";

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

function repository(value: PairingProfile | null): PairingRepository {
  return {
    get: jest.fn().mockResolvedValue(value),
    replace: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
}

function pendingClient(): MobileClient {
  return {
    connect: jest.fn(() => new Promise<void>(() => undefined)),
    close: jest.fn(),
    request: jest.fn() as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn(() => jest.fn()),
  };
}

function recoveryClient(code: "DESKTOP_OFFLINE" | "DAEMON_UNAVAILABLE") {
  let recover = false;
  const client: MobileClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    request: jest.fn(async (method: string) => {
      if (!recover && method === "mobile.resume") {
        throw Object.assign(new Error(code), { code });
      }
      if (method === "mobile.resume") {
        return { resumed: true, negotiatedCapabilities: ["interaction.structured"] };
      }
      if (method === "session.list") return { sessions: [] };
      return { session: {}, mode: "live" };
    }) as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn(() => jest.fn()),
  };
  return { client, recover: () => { recover = true; } };
}

const runningSession = {
  id: "session-1",
  agent: "codex",
  title: "Codex task",
  command: "codex",
  argv: [],
  cwd: "/work/project",
  status: "running",
  createdAt: "2026-07-11T10:00:00.000Z",
  lastActivityAt: "2026-07-11T12:00:00.000Z",
} as const;

function onlineClient() {
  let connectionListener: ((state: "disconnected" | "connecting" | "connected") => void) | undefined;
  const client: MobileClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(() => connectionListener?.("disconnected")),
    request: jest.fn(async (method: string) => {
      if (method === "mobile.resume") return { resumed: true };
      if (method === "session.list") return { sessions: [runningSession] };
      return { session: runningSession, mode: "live" };
    }) as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn((listener) => {
      connectionListener = listener;
      return jest.fn();
    }),
  };
  return { client, disconnect: () => connectionListener?.("disconnected") };
}

function Probe() {
  const app = useApp();
  return (
    <Text>
      {app.bootstrapStatus}:{app.connectionStatus}:{app.profile?.desktopName ?? "none"}
    </Text>
  );
}

test("redirects an installation without a stored profile to pairing", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };

  render(
    <AppProvider
      dependencies={{ navigation, profileRepository: repository(null) }}
    >
      <Probe />
    </AppProvider>,
  );

  await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/pairing"));
  expect(screen.getByText("ready:idle:none")).toBeVisible();
});

test("restores a profile and enters the tab shell in reconnecting state", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };

  render(
    <AppProvider
      dependencies={{
        client: pendingClient(),
        navigation,
        profileRepository: repository(profile),
      }}
    >
      <Probe />
    </AppProvider>,
  );

  await waitFor(() =>
    expect(navigation.replace).toHaveBeenCalledWith("/(tabs)/inbox"),
  );
  expect(screen.getByText("ready:reconnecting:MacBook")).toBeVisible();
});

test("exposes navigation and exact-card dismissal callbacks", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  let current: ReturnType<typeof useApp> | undefined;

  function ActionsProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{
        client: pendingClient(),
        navigation,
        profileRepository: repository(profile),
      }}
    >
      <ActionsProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.bootstrapStatus).toBe("ready"));

  act(() => {
    current?.openSession("session-1");
    current?.dismissAttention("session-1:waiting:now");
  });

  expect(navigation.push).toHaveBeenCalledWith("/session/session-1");
  expect(current?.navigation).toBe(navigation);
  expect(current?.sessionState.dismissedAttentionKeys).toEqual({
    "session-1:waiting:now": true,
  });
});

test("backs every declared or targeted route with a filesystem module", () => {
  expect(NewRoute).toEqual(expect.any(Function));
  expect(SettingsRoute).toEqual(expect.any(Function));
  expect(SessionRoute).toEqual(expect.any(Function));
  expect(RecoveryRoute).toEqual(expect.any(Function));
});

test.each(["DESKTOP_OFFLINE", "DAEMON_UNAVAILABLE"] as const)(
  "%s opens recovery, retry preserves the profile, and replacement pairing stays explicit",
  async (code) => {
    const navigation = { push: jest.fn(), replace: jest.fn() };
    const profileRepository = repository(profile);
    const transport = recoveryClient(code);
    let current: ReturnType<typeof useApp> | undefined;

    function RecoveryProbe() {
      current = useApp();
      return null;
    }

    render(
      <AppProvider
        dependencies={{
          client: transport.client,
          navigation,
          profileRepository,
        }}
      >
        <RecoveryProbe />
      </AppProvider>,
    );

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/recovery"));
    expect(current?.connectionStatus).toBe("recovery");
    expect(current?.profile).toEqual(profile);

    transport.recover();
    await act(async () => {
      await current?.retryConnection();
    });
    expect(profileRepository.clear).not.toHaveBeenCalled();
    expect(current?.profile).toEqual(profile);
    expect(current?.negotiatedCapabilities?.has("interaction.structured")).toBe(true);
    expect(navigation.replace).toHaveBeenCalledWith("/(tabs)/inbox");

    act(() => current?.pairAnotherComputer());
    expect(navigation.push).toHaveBeenCalledWith("/pairing");
    expect(profileRepository.clear).not.toHaveBeenCalled();
  },
);

test("explicit re-pair clears coordinator state before closing transport", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const profileRepository = repository(profile);
  const transport = onlineClient();
  let current: ReturnType<typeof useApp> | undefined;

  function ClearProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider dependencies={{ client: transport.client, navigation, profileRepository }}>
      <ClearProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));

  jest.useFakeTimers();
  await act(async () => {
    await current?.clearPairing();
    await jest.runAllTimersAsync();
  });
  jest.useRealTimers();

  expect(transport.client.connect).toHaveBeenCalledTimes(1);
  expect(profileRepository.clear).toHaveBeenCalledTimes(1);
  expect(current?.profile).toBeNull();
  expect(current?.connectionStatus).toBe("pairingRequired");
});

test("ordinary reconnect keeps an open session route instead of returning to Inbox", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const transport = onlineClient();
  let current: ReturnType<typeof useApp> | undefined;

  function SessionProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{ client: transport.client, navigation, profileRepository: repository(profile) }}
    >
      <SessionProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));
  act(() => current?.openSession("session-1"));
  navigation.replace.mockClear();

  jest.useFakeTimers();
  act(() => transport.disconnect());
  await act(async () => {
    await jest.runAllTimersAsync();
  });
  jest.useRealTimers();

  expect(current?.connectionStatus).toBe("online");
  expect(navigation.replace).not.toHaveBeenCalledWith("/(tabs)/inbox");
});

test("opening a session while online subscribes immediately with its last sequence", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const transport = onlineClient();
  let current: ReturnType<typeof useApp> | undefined;

  function SubscribeProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{ client: transport.client, navigation, profileRepository: repository(profile) }}
    >
      <SubscribeProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));
  (transport.client.request as jest.Mock).mockClear();

  act(() => current?.openSession("session-1"));

  await waitFor(() =>
    expect(transport.client.request).toHaveBeenCalledWith("session.subscribe", {
      sessionId: "session-1",
    }),
  );
});

test("replacement pairing uses an isolated transport and preserves the active connection on failure", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const activeTransport = onlineClient();
  const pairingClient: MobileClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
    request: jest.fn().mockRejectedValue(new Error("invalid pairing")) as unknown as MobileClient["request"],
    onEvent: jest.fn(() => jest.fn()),
    onConnection: jest.fn(() => jest.fn()),
  };
  let current: ReturnType<typeof useApp> | undefined;

  function PairProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{
        client: activeTransport.client,
        pairingClient,
        navigation,
        profileRepository: repository(profile),
      }}
    >
      <PairProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));

  await expect(current?.pair({
    relayWsUrl: "wss://other.example/v1/ws/mobile",
    desktopId: "desktop-2",
    pairingCode: "123456",
    mobileDevice: { id: "mobile-1", name: "iPhone", platform: "ios" },
  })).rejects.toThrow("invalid pairing");

  expect(activeTransport.client.connect).toHaveBeenCalledTimes(1);
  expect(pairingClient.connect).toHaveBeenCalledTimes(1);
  expect(pairingClient.close).toHaveBeenCalledTimes(1);
  expect(current?.profile).toEqual(profile);
  expect(current?.connectionStatus).toBe("online");
});

test("late subscription responses cannot replace the most recently opened session", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  const resolvers = new Map<string, (value: unknown) => void>();
  const transport = onlineClient();
  (transport.client.request as jest.Mock).mockImplementation(
    async (method: string, params: Record<string, unknown>) => {
      if (method === "mobile.resume") return { resumed: true };
      if (method === "session.list") {
        return {
          sessions: [
            runningSession,
            { ...runningSession, id: "session-2", title: "Second task" },
          ],
        };
      }
      if (method === "session.subscribe") {
        return new Promise((resolve) => {
          resolvers.set(String(params.sessionId), resolve);
        });
      }
      return {};
    },
  );
  let current: ReturnType<typeof useApp> | undefined;

  function RaceProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{ client: transport.client, navigation, profileRepository: repository(profile) }}
    >
      <RaceProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));

  act(() => {
    current?.openSession("session-1");
    current?.openSession("session-2");
  });
  await waitFor(() => expect(resolvers.size).toBe(2));
  await act(async () => {
    resolvers.get("session-2")?.({
      session: { ...runningSession, id: "session-2", title: "Second task" },
      mode: "live",
    });
    await Promise.resolve();
    resolvers.get("session-1")?.({ session: runningSession, mode: "live" });
    await Promise.resolve();
  });

  expect(current?.sessionState.openSessionId).toBe("session-2");
  expect(current?.sessionState.subscribedSessionId).toBe("session-2");
});

test("opening the same session twice keeps its pending subscription result", async () => {
  const navigation = { push: jest.fn(), replace: jest.fn() };
  let resolveSubscription: ((value: unknown) => void) | undefined;
  const transport = onlineClient();
  (transport.client.request as jest.Mock).mockImplementation(
    async (method: string) => {
      if (method === "mobile.resume") return { resumed: true };
      if (method === "session.list") return { sessions: [runningSession] };
      if (method === "session.subscribe") {
        return new Promise((resolve) => {
          resolveSubscription = resolve;
        });
      }
      return {};
    },
  );
  let current: ReturnType<typeof useApp> | undefined;

  function DuplicateOpenProbe() {
    current = useApp();
    return null;
  }

  render(
    <AppProvider
      dependencies={{ client: transport.client, navigation, profileRepository: repository(profile) }}
    >
      <DuplicateOpenProbe />
    </AppProvider>,
  );
  await waitFor(() => expect(current?.connectionStatus).toBe("online"));

  act(() => {
    current?.openSession("session-1");
    current?.openSession("session-1");
  });
  await waitFor(() => expect(resolveSubscription).toBeDefined());
  await act(async () => {
    resolveSubscription?.({
      session: runningSession,
      mode: "snapshot",
      terminalBuffer: "restored output",
      lastSeq: 7,
    });
    await Promise.resolve();
  });

  expect(transport.client.request).toHaveBeenCalledWith(
    "session.subscribe",
    { sessionId: "session-1" },
  );
  expect(current?.sessionState.subscribedSessionId).toBe("session-1");
  expect(current?.sessionState.terminalBySessionId["session-1"]).toEqual({
    text: "restored output",
    lastSeq: 7,
  });
});
