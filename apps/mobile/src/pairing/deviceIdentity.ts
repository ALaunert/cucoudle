import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { MobileDeviceSchema, type MobileDevice, type MobilePlatform } from "@cucoudle/protocol";

const DEVICE_IDENTITY_KEY = "cucoudle.mobileDeviceIdentity.v1";

export type DeviceIdentityStorage = Pick<typeof SecureStore, "getItemAsync" | "setItemAsync">;

export type DeviceIdentityDependencies = {
  randomUUID(): string;
  platform: MobilePlatform;
  deviceName: string;
};

function currentPlatform(): MobilePlatform {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown";
}

const defaultDependencies: DeviceIdentityDependencies = {
  randomUUID,
  platform: currentPlatform(),
  deviceName: "Мобильное устройство",
};

export async function getOrCreateDeviceIdentity(
  storage: DeviceIdentityStorage = SecureStore,
  dependencies: Partial<DeviceIdentityDependencies> = {},
): Promise<MobileDevice> {
  const raw = await storage.getItemAsync(DEVICE_IDENTITY_KEY);
  if (raw) {
    try {
      return MobileDeviceSchema.parse(JSON.parse(raw));
    } catch {
      // Replace malformed state with a fresh, validated identity.
    }
  }

  const deps = { ...defaultDependencies, ...dependencies };
  const identity = MobileDeviceSchema.parse({
    id: deps.randomUUID(),
    name: deps.deviceName,
    platform: deps.platform,
  });
  await storage.setItemAsync(DEVICE_IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}
