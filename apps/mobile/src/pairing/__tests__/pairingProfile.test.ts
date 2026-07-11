jest.mock("@cucoudle/protocol", () => {
  const { z } = require("zod") as typeof import("zod");
  return {
    QrPayloadSchema: z.object({
      relayUrl: z.string(),
      desktopId: z.string(),
      pairingCode: z.string(),
      expiresAt: z.string(),
    }),
    MobileDeviceSchema: z.object({
      id: z.string(),
      name: z.string(),
      platform: z.enum(["ios", "android", "unknown"]),
    }),
    MobilePairResultSchema: z.object({
      desktopId: z.string(),
      desktopName: z.string(),
      paired: z.literal(true),
      mobileSessionToken: z.string(),
      mobileSessionExpiresAt: z.string(),
    }),
  };
});

import {
  PairingProfileSchema,
  buildPairingProfile,
  parseQrPairingRequest,
  validateManualPairingRequest,
} from "../pairingProfile";
import { getOrCreateDeviceIdentity } from "../deviceIdentity";

const relayWsUrl = "wss://relay.cucoudle.dev/v1/ws/mobile";

test("normalizes the protocol QR relayUrl to relayWsUrl", () => {
  expect(
    parseQrPairingRequest(
      JSON.stringify({
        relayUrl: relayWsUrl,
        desktopId: "desktop-1",
        pairingCode: "123456",
        expiresAt: "2026-07-11T12:00:00.000Z",
      }),
    ),
  ).toEqual({ relayWsUrl, desktopId: "desktop-1", pairingCode: "123456" });
});

test.each([
  ["https://relay.cucoudle.dev/v1/ws/mobile", "Адрес реле должен начинаться с ws:// или wss://"],
  ["wss://relay.cucoudle.dev/socket", "Адрес реле должен оканчиваться на /v1/ws/mobile"],
  ["", "Укажите адрес реле"],
])("rejects an invalid manual relay URL %s", (value, message) => {
  expect(
    validateManualPairingRequest({
      relayWsUrl: value,
      desktopId: "desktop-1",
      pairingCode: "123456",
    }),
  ).toEqual({ ok: false, errors: { relayWsUrl: message } });
});

test("rejects missing manual desktop and pairing code", () => {
  expect(
    validateManualPairingRequest({ relayWsUrl, desktopId: " ", pairingCode: "" }),
  ).toEqual({
    ok: false,
    errors: {
      desktopId: "Укажите ID компьютера",
      pairingCode: "Укажите код подключения",
    },
  });
});

test("builds an exact validated active profile from request, device, and result", () => {
  const profile = buildPairingProfile(
    { relayWsUrl, desktopId: "desktop-1", pairingCode: "123456" },
    { id: "mobile-1", name: "iPhone", platform: "ios" },
    {
      desktopId: "desktop-1",
      desktopName: "Рабочий Mac",
      paired: true,
      mobileSessionToken: "secret",
      mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
    },
  );

  expect(profile).toEqual({
    relayWsUrl,
    desktopId: "desktop-1",
    desktopName: "Рабочий Mac",
    mobileDeviceId: "mobile-1",
    mobileDeviceName: "iPhone",
    mobilePlatform: "ios",
    mobileSessionToken: "secret",
    mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
  });
  expect(PairingProfileSchema.safeParse(profile).success).toBe(true);
});

test("rejects a pairing result for a different desktop", () => {
  expect(() =>
    buildPairingProfile(
      { relayWsUrl, desktopId: "desktop-1", pairingCode: "123456" },
      { id: "mobile-1", name: "Android", platform: "android" },
      {
        desktopId: "desktop-2",
        desktopName: "Other",
        paired: true,
        mobileSessionToken: "secret",
        mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
      },
    ),
  ).toThrow("desktopId");
});

test("persists and reuses a stable UUID device identity", async () => {
  let stored: string | null = null;
  const storage = {
    getItemAsync: jest.fn(async () => stored),
    setItemAsync: jest.fn(async (_key: string, value: string) => {
      stored = value;
    }),
  };
  const randomUUID = jest.fn(() => "uuid-1");

  await expect(
    getOrCreateDeviceIdentity(storage, {
      randomUUID,
      platform: "ios",
      deviceName: "Телефон Алексея",
    }),
  ).resolves.toEqual({ id: "uuid-1", name: "Телефон Алексея", platform: "ios" });
  await expect(
    getOrCreateDeviceIdentity(storage, {
      randomUUID,
      platform: "android",
      deviceName: "Новое имя",
    }),
  ).resolves.toEqual({ id: "uuid-1", name: "Телефон Алексея", platform: "ios" });
  expect(randomUUID).toHaveBeenCalledTimes(1);
});
