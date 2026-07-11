import * as SecureStore from "expo-secure-store";

import { PairingProfileSchema, type PairingProfile } from "./pairingProfile";

const ACTIVE_PAIRING_PROFILE_KEY = "cucoudle.activePairingProfile.v1";

export type PairingStorage = Pick<
  typeof SecureStore,
  "getItemAsync" | "setItemAsync" | "deleteItemAsync"
>;

export type PairingRepository = {
  get(): Promise<PairingProfile | null>;
  replace(profile: PairingProfile): Promise<void>;
  clear(): Promise<void>;
};

export function createPairingRepository(
  storage: PairingStorage = SecureStore,
): PairingRepository {
  return {
    async get() {
      const raw = await storage.getItemAsync(ACTIVE_PAIRING_PROFILE_KEY);
      if (!raw) return null;
      try {
        return PairingProfileSchema.parse(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    async replace(profile) {
      const validated = PairingProfileSchema.parse(profile);
      await storage.setItemAsync(ACTIVE_PAIRING_PROFILE_KEY, JSON.stringify(validated));
    },

    async clear() {
      await storage.deleteItemAsync(ACTIVE_PAIRING_PROFILE_KEY);
    },
  };
}
