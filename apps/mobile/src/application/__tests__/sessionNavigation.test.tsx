jest.mock("@cucoudle/protocol", () =>
  jest.requireActual("../../../../../packages/protocol/src/envelope.ts"),
);

import { Stack, router } from "expo-router";
import { act, fireEvent, screen } from "@testing-library/react-native";
import { renderRouter } from "expo-router/testing-library";

import type { EventMessage, MobileDevice, Session } from "@cucoudle/protocol";

import type { PairingProfile } from "../../pairing/pairingProfile";
import type { PairingRepository } from "../../pairing/pairingRepository";
import type { MobileClient } from "../../protocol/mobileClient";
import { AppProvider } from "../AppProvider";

import RootIndex from "../../app/index";
import TabsLayout from "../../app/(tabs)/_layout";
import SessionsRoute from "../../app/(tabs)/sessions";
import InboxRoute from "../../app/(tabs)/inbox";
import SessionRoute from "../../app/session/[id]";

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

function createFakeClient(): MobileClient {
  let connectionListener:
    | ((state: "disconnected" | "connecting" | "connected") => void)
    | undefined;
  return {
    connect: jest.fn(async () => {
      connectionListener?.("connected");
    }),
    close: jest.fn(() => connectionListener?.("disconnected")),
    request: jest.fn(async (method: string) => {
      if (method === "mobile.resume") return { resumed: true };
      if (method === "session.list") return { sessions: [session] };
      if (method === "session.subscribe") {
        return { session, mode: "snapshot", terminalBuffer: "hi\n", lastSeq: 1 };
      }
      return {};
    }) as unknown as MobileClient["request"],
    onEvent: jest.fn((_listener: (event: EventMessage) => void) => () => undefined),
    onConnection: jest.fn(
      (listener: (state: "disconnected" | "connecting" | "connected") => void) => {
        connectionListener = listener;
        return () => undefined;
      },
    ),
  } as unknown as MobileClient;
}

const profileRepository: PairingRepository = {
  get: jest.fn(async () => profile),
  replace: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
};

const device: MobileDevice = {
  id: "mobile-1",
  name: "iPhone",
  platform: "ios",
};

function RootLayout() {
  return (
    <AppProvider
      dependencies={{
        client: createFakeClient(),
        pairingClient: createFakeClient(),
        profileRepository,
        getDeviceIdentity: async () => device,
      }}
    >
      <Stack screenOptions={{ headerShown: false }} />
    </AppProvider>
  );
}

test("tapping a session tile navigates to /session/[id] through the real router", async () => {
  renderRouter(
    {
      _layout: RootLayout,
      index: RootIndex,
      "(tabs)/_layout": TabsLayout,
      "(tabs)/sessions": SessionsRoute,
      "(tabs)/inbox": InboxRoute,
      "session/[id]": SessionRoute,
    },
    { initialUrl: "/(tabs)/sessions" },
  );

  await act(async () => {
    await Promise.resolve();
  });

  // Bootstrap replaces the route with /(tabs)/inbox; switch to the sessions tab
  // the same way the real router would.
  await act(async () => {
    router.push("/(tabs)/sessions");
    await Promise.resolve();
  });

  fireEvent.press(await screen.findByTestId("session-row-session-1"));

  await act(async () => {
    await Promise.resolve();
  });

  expect(await screen.findByTestId("session-screen")).toBeTruthy();
  expect(screen.getByText("Mobile flow")).toBeTruthy();
});
