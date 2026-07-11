jest.mock("@cucoudle/protocol", () => {
  const { z } = require("zod") as typeof import("zod");
  return {
    QrPayloadSchema: z.object({
      relayUrl: z.string(), desktopId: z.string(), pairingCode: z.string(), expiresAt: z.string(),
    }),
    MobileDeviceSchema: z.object({
      id: z.string(), name: z.string(), platform: z.enum(["ios", "android", "unknown"]),
    }),
    MobilePairResultSchema: z.object({
      desktopId: z.string(), desktopName: z.string(), paired: z.literal(true),
      mobileSessionToken: z.string(), mobileSessionExpiresAt: z.string(),
    }),
  };
});

import { createPairingRepository } from "../pairingRepository";

const profile = {
  relayWsUrl: "wss://relay.cucoudle.dev/v1/ws/mobile",
  desktopId: "desktop-1",
  desktopName: "Рабочий Mac",
  mobileDeviceId: "mobile-1",
  mobileDeviceName: "iPhone",
  mobilePlatform: "ios" as const,
  mobileSessionToken: "secret",
  mobileSessionExpiresAt: "2026-08-01T00:00:00.000Z",
};

function memoryStore(initial: string | null = null) {
  let value = initial;
  return {
    storage: {
      getItemAsync: jest.fn(async () => value),
      setItemAsync: jest.fn(async (_key: string, next: string) => {
        value = next;
      }),
      deleteItemAsync: jest.fn(async () => {
        value = null;
      }),
    },
    read: () => value,
  };
}

test("round-trips and replaces the single active validated profile", async () => {
  const store = memoryStore();
  const repository = createPairingRepository(store.storage);

  await repository.replace(profile);
  await expect(repository.get()).resolves.toEqual(profile);

  const replacement = { ...profile, desktopId: "desktop-2", desktopName: "Домашний Mac" };
  await repository.replace(replacement);
  await expect(repository.get()).resolves.toEqual(replacement);
  expect(JSON.parse(store.read()!)).toEqual(replacement);
});

test("rejects invalid profiles before replacing persisted state", async () => {
  const store = memoryStore(JSON.stringify(profile));
  const repository = createPairingRepository(store.storage);

  await expect(
    repository.replace({ ...profile, relayWsUrl: "https://relay.cucoudle.dev" } as never),
  ).rejects.toThrow();
  expect(JSON.parse(store.read()!)).toEqual(profile);
});

test("returns null for malformed or schema-invalid persisted data", async () => {
  await expect(createPairingRepository(memoryStore("not-json").storage).get()).resolves.toBeNull();
  await expect(
    createPairingRepository(memoryStore(JSON.stringify({ desktopId: "desktop-1" })).storage).get(),
  ).resolves.toBeNull();
});

test("clears the active profile", async () => {
  const store = memoryStore(JSON.stringify(profile));
  const repository = createPairingRepository(store.storage);

  await repository.clear();

  await expect(repository.get()).resolves.toBeNull();
  expect(store.storage.deleteItemAsync).toHaveBeenCalledTimes(1);
});
