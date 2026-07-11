import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@cucoudle/protocol", () => {
  const { z } = require("zod") as typeof import("zod");
  return {
    QrPayloadSchema: z.object({
      relayUrl: z.string(), desktopId: z.string(), pairingCode: z.string(), expiresAt: z.string(),
    }),
    MobileDeviceSchema: z.object({
      id: z.string(), name: z.string(), platform: z.enum(["ios", "android", "unknown"]),
    }),
    MobilePairParamsSchema: z.object({
      desktopId: z.string(), pairingCode: z.string(),
      mobileDevice: z.object({
        id: z.string(), name: z.string(), platform: z.enum(["ios", "android", "unknown"]),
      }),
    }),
    MobilePairResultSchema: z.object({
      desktopId: z.string(), desktopName: z.string(), paired: z.literal(true),
      mobileSessionToken: z.string(), mobileSessionExpiresAt: z.string(),
    }),
  };
});

import { ProtocolError } from "../../../protocol/protocolError";
import { PairingScreen } from "../PairingScreen";

let mockPermission: { granted: boolean; canAskAgain: boolean } | null;
const mockRequestPermission = jest.fn();
let mockScannedData = "";

jest.mock("expo-camera", () => {
  const { Pressable, Text } = require("react-native") as typeof import("react-native");
  return {
    CameraView: ({ onBarcodeScanned }: { onBarcodeScanned?: (event: { data: string }) => void }) => (
      <Pressable testID="camera" onPress={() => onBarcodeScanned?.({ data: mockScannedData })}>
        <Text>Камера</Text>
      </Pressable>
    ),
    useCameraPermissions: () => [mockPermission, mockRequestPermission],
  };
});

const relayWsUrl = "wss://relay.cucoudle.dev/v1/ws/mobile";
const qr = JSON.stringify({
  relayUrl: relayWsUrl,
  desktopId: "desktop-1",
  pairingCode: "123456",
  expiresAt: "2026-07-11T12:00:00.000Z",
});
const device = { id: "mobile-1", name: "iPhone", platform: "ios" as const };
const result = {
  desktopId: "desktop-1",
  desktopName: "Рабочий Mac",
  paired: true as const,
  mobileSessionToken: "secret",
  mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
};

function renderScreen(overrides: Partial<React.ComponentProps<typeof PairingScreen>> = {}) {
  const props: React.ComponentProps<typeof PairingScreen> = {
    pair: jest.fn(async () => result),
    saveProfile: jest.fn(async () => undefined),
    getDeviceIdentity: jest.fn(async () => device),
    onPaired: jest.fn(),
    ...overrides,
  };
  render(<PairingScreen {...props} />);
  return props;
}

beforeEach(() => {
  mockPermission = { granted: true, canAskAgain: true };
  mockScannedData = qr;
  mockRequestPermission.mockReset();
});

test("shows clear denied camera permission copy", () => {
  mockPermission = { granted: false, canAskAgain: false };
  renderScreen();

  expect(screen.getByText("Нет доступа к камере")).toBeOnTheScreen();
  expect(screen.getByText(/подключ.*вручную/i)).toBeOnTheScreen();
});

test("requests camera permission when it can still be granted", () => {
  mockPermission = { granted: false, canAskAgain: true };
  renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Разрешить камеру" }));
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
});

test("pairs from a scanned QR, saves the profile, and reports success", async () => {
  const pair = jest.fn(async () => result);
  const saveProfile = jest.fn(async () => undefined);
  const onPaired = jest.fn();
  renderScreen({ pair, saveProfile, onPaired });

  fireEvent.press(screen.getByTestId("camera"));

  await waitFor(() =>
    expect(pair).toHaveBeenCalledWith({
      relayWsUrl,
      desktopId: "desktop-1",
      pairingCode: "123456",
      mobileDevice: device,
    }),
  );
  expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({
    relayWsUrl,
    desktopId: "desktop-1",
    mobileSessionToken: "secret",
  }));
  expect(onPaired).toHaveBeenCalledWith(expect.objectContaining({ desktopName: "Рабочий Mac" }));
});

test("switches to manual mode, validates fields, and shows loading", async () => {
  let resolvePair!: (value: typeof result) => void;
  const pair = jest.fn(() => new Promise<typeof result>((resolve) => {
    resolvePair = resolve;
  }));
  renderScreen({ pair });

  fireEvent.press(screen.getByRole("button", { name: "Ввести данные вручную" }));
  fireEvent.press(screen.getByRole("button", { name: "Подключить" }));
  expect(screen.getByText("Укажите адрес реле")).toBeOnTheScreen();
  expect(screen.getByText("Укажите ID компьютера")).toBeOnTheScreen();
  expect(screen.getByText("Укажите код подключения")).toBeOnTheScreen();

  fireEvent.changeText(screen.getByLabelText("Адрес реле"), relayWsUrl);
  fireEvent.changeText(screen.getByLabelText("ID компьютера"), "desktop-1");
  fireEvent.changeText(screen.getByLabelText("Код подключения"), "123456");
  fireEvent.press(screen.getByRole("button", { name: "Подключить" }));

  expect(await screen.findByRole("button", { name: "Подключаем…" })).toBeDisabled();
  resolvePair(result);
  await waitFor(() => expect(pair).toHaveBeenCalledTimes(1));
});

test.each([
  ["PAIRING_EXPIRED", "Код подключения истёк. Создайте новый код на компьютере."],
  ["PAIRING_NOT_FOUND", "Код подключения не найден. Проверьте данные или создайте новый код."],
  ["DESKTOP_OFFLINE", "Компьютер не в сети. Запустите Cucoudle на компьютере и попробуйте снова."],
] as const)("shows Russian copy for %s", async (code, copy) => {
  const pair = jest.fn(async () => {
    throw new ProtocolError(code, "relay error");
  });
  renderScreen({ pair });

  fireEvent.press(screen.getByTestId("camera"));

  expect(await screen.findByText(copy)).toBeOnTheScreen();
});

test("rejects malformed QR without calling the pairing transport", async () => {
  mockScannedData = JSON.stringify({ relayUrl: "https://relay", desktopId: "desktop-1" });
  const pair = jest.fn(async () => result);
  renderScreen({ pair });

  fireEvent.press(screen.getByTestId("camera"));

  expect(await screen.findByText("Не удалось прочитать QR-код подключения.")).toBeOnTheScreen();
  expect(pair).not.toHaveBeenCalled();
});

test("validates mobile.pair params before calling the transport", async () => {
  const pair = jest.fn(async () => result);
  renderScreen({
    pair,
    getDeviceIdentity: jest.fn(async () => ({ ...device, platform: "windows" as never })),
  });

  fireEvent.press(screen.getByTestId("camera"));

  expect(await screen.findByText("Не удалось подключиться. Проверьте соединение и попробуйте снова.")).toBeOnTheScreen();
  expect(pair).not.toHaveBeenCalled();
});
