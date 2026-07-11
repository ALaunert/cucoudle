import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import type { PairingProfile } from "../../../pairing/pairingProfile";
import { SettingsScreen } from "../SettingsScreen";

const profile: PairingProfile = {
  relayWsUrl: "wss://relay.example/v1/ws/mobile",
  desktopId: "desktop-1",
  desktopName: "MacBook Алексея",
  mobileDeviceId: "mobile-1",
  mobileDeviceName: "iPhone Алексея",
  mobilePlatform: "ios",
  mobileSessionToken: "secret",
  mobileSessionExpiresAt: "2026-07-12T10:00:00.000Z",
};

afterEach(() => {
  jest.restoreAllMocks();
});

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof SettingsScreen>> = {},
) {
  const props: React.ComponentProps<typeof SettingsScreen> = {
    profile,
    connectionStatus: "offline",
    protocolVersion: "2026-07-11",
    appVersion: "1.0.0",
    onRetry: jest.fn(),
    onRePair: jest.fn(),
    onReplaceComputer: jest.fn(),
    ...overrides,
  };
  render(<SettingsScreen {...props} />);
  return props;
}

test("shows paired device identities, connection status, and versions", () => {
  renderScreen();

  expect(screen.getByText("MacBook Алексея")).toBeVisible();
  expect(screen.getByText("desktop-1")).toBeVisible();
  expect(screen.getByText("iPhone Алексея")).toBeVisible();
  expect(screen.getByText("mobile-1")).toBeVisible();
  expect(screen.getByText("Не в сети")).toBeVisible();
  expect(screen.getByText("2026-07-11")).toBeVisible();
  expect(screen.getByText("1.0.0")).toBeVisible();
  expect(screen.getByText(/хакатонная версия/i)).toBeVisible();
});

test("requests a connection retry without clearing the pairing", () => {
  const props = renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Повторить подключение" }));

  expect(props.onRetry).toHaveBeenCalledTimes(1);
  expect(props.onRePair).not.toHaveBeenCalled();
  expect(props.onReplaceComputer).not.toHaveBeenCalled();
});

test.each([
  { button: "Подключить заново", confirm: "Подключить заново", callback: "onRePair" as const },
  { button: "Заменить компьютер", confirm: "Заменить", callback: "onReplaceComputer" as const },
])("does not run $callback when its confirmation is cancelled", ({ button, callback }) => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const props = renderScreen();

  fireEvent.press(screen.getByRole("button", { name: button }));
  const buttons = alert.mock.calls[0]?.[2];
  buttons?.find((item) => item.text === "Отмена")?.onPress?.();

  expect(props[callback]).not.toHaveBeenCalled();
});

test.each([
  { button: "Подключить заново", confirm: "Подключить заново", callback: "onRePair" as const },
  { button: "Заменить компьютер", confirm: "Заменить", callback: "onReplaceComputer" as const },
])("runs $callback only after explicit confirmation", ({ button, confirm, callback }) => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  const props = renderScreen();

  fireEvent.press(screen.getByRole("button", { name: button }));
  expect(props[callback]).not.toHaveBeenCalled();
  const buttons = alert.mock.calls[0]?.[2];
  buttons?.find((item) => item.text === confirm)?.onPress?.();

  expect(props[callback]).toHaveBeenCalledTimes(1);
});
