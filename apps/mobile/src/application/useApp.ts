import { createContext, useContext } from "react";

import type { MobileDevice } from "@cucoudle/protocol";
import type { PairingProfile, PairingResult, PairingTransportRequest } from "../pairing/pairingProfile";
import type { PairingRepository } from "../pairing/pairingRepository";
import type { MobileClient } from "../protocol/mobileClient";
import type { SessionAction, SessionState } from "../state/sessionState";

export type AppConnectionStatus =
  | "idle"
  | "reconnecting"
  | "resyncing"
  | "online"
  | "offline"
  | "recovery"
  | "pairingRequired";

export type AppNavigation = {
  push(path: string): void;
  replace(path: string): void;
};

export type AppContextValue = {
  bootstrapStatus: "loading" | "ready";
  connectionStatus: AppConnectionStatus;
  profile: PairingProfile | null;
  sessionState: SessionState;
  hasLoadedSessionList: boolean;
  client: MobileClient;
  profileRepository: PairingRepository;
  navigation: AppNavigation;
  dispatch(action: SessionAction): void;
  pair(request: PairingTransportRequest): Promise<PairingResult>;
  saveProfile(profile: PairingProfile): Promise<void>;
  getDeviceIdentity(): Promise<MobileDevice>;
  onPaired(profile: PairingProfile): void;
  dismissAttention(key: string): void;
  openSession(sessionId: string): void;
  viewSession(sessionId: string): void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
