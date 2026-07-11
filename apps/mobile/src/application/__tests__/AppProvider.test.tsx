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
import { AppProvider } from "../AppProvider";
import { useApp } from "../useApp";
import NewRoute from "../../app/(tabs)/new";
import SettingsRoute from "../../app/(tabs)/settings";
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

function repository(value: PairingProfile | null): PairingRepository {
  return {
    get: jest.fn().mockResolvedValue(value),
    replace: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
  };
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
      dependencies={{ navigation, profileRepository: repository(profile) }}
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
      dependencies={{ navigation, profileRepository: repository(profile) }}
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
});
