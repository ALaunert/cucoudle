import type { PropsWithChildren } from "react";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { router } from "expo-router";

import type { MobileDevice } from "@cucoudle/protocol";
import { getOrCreateDeviceIdentity } from "../pairing/deviceIdentity";
import type {
  PairingProfile,
  PairingResult,
  PairingTransportRequest,
} from "../pairing/pairingProfile";
import {
  createPairingRepository,
  type PairingRepository,
} from "../pairing/pairingRepository";
import { createMobileClient, type MobileClient } from "../protocol/mobileClient";
import { sessionReducer } from "../state/sessionReducer";
import { createInitialSessionState } from "../state/sessionState";
import {
  AppContext,
  type AppConnectionStatus,
  type AppNavigation,
} from "./useApp";

type AppProviderDependencies = {
  navigation?: AppNavigation;
  profileRepository?: PairingRepository;
  client?: MobileClient;
  getDeviceIdentity?: () => Promise<MobileDevice>;
};

type AppProviderProps = PropsWithChildren<{
  dependencies?: AppProviderDependencies;
}>;

const routerNavigation: AppNavigation = {
  push: (path) => router.push(path as never),
  replace: (path) => router.replace(path as never),
};

export function AppProvider({ children, dependencies }: AppProviderProps) {
  const navigation = useRef(dependencies?.navigation ?? routerNavigation).current;
  const profileRepository = useRef(
    dependencies?.profileRepository ?? createPairingRepository(),
  ).current;
  const client = useRef(dependencies?.client ?? createMobileClient()).current;
  const loadDeviceIdentity = useRef(
    dependencies?.getDeviceIdentity ?? (() => getOrCreateDeviceIdentity()),
  ).current;
  const [sessionState, dispatch] = useReducer(
    sessionReducer,
    undefined,
    createInitialSessionState,
  );
  const [profile, setProfile] = useState<PairingProfile | null>(null);
  const [bootstrapStatus, setBootstrapStatus] = useState<"loading" | "ready">(
    "loading",
  );
  const [connectionStatus, setConnectionStatus] =
    useState<AppConnectionStatus>("idle");
  const [hasLoadedSessionList] = useState(false);

  useEffect(() => {
    let active = true;
    void profileRepository
      .get()
      .then((restored) => {
        if (!active) return;
        setProfile(restored);
        setConnectionStatus(restored ? "reconnecting" : "idle");
        setBootstrapStatus("ready");
        navigation.replace(restored ? "/(tabs)/inbox" : "/pairing");
      })
      .catch(() => {
        if (!active) return;
        setProfile(null);
        setConnectionStatus("idle");
        setBootstrapStatus("ready");
        navigation.replace("/pairing");
      });
    return () => {
      active = false;
    };
  }, [navigation, profileRepository]);

  const value = useMemo(
    () => ({
      bootstrapStatus,
      connectionStatus,
      profile,
      sessionState,
      hasLoadedSessionList,
      client,
      profileRepository,
      navigation,
      dispatch,
      async pair(request: PairingTransportRequest): Promise<PairingResult> {
        await client.connect(request.relayWsUrl);
        return client.request<PairingResult>("mobile.pair", {
          desktopId: request.desktopId,
          pairingCode: request.pairingCode,
          mobileDevice: request.mobileDevice,
        });
      },
      saveProfile(nextProfile: PairingProfile) {
        return profileRepository.replace(nextProfile);
      },
      getDeviceIdentity: loadDeviceIdentity,
      onPaired(nextProfile: PairingProfile) {
        setProfile(nextProfile);
        setConnectionStatus("reconnecting");
        navigation.replace("/(tabs)/inbox");
      },
      dismissAttention(key: string) {
        dispatch({ type: "attention/dismissed", key });
      },
      openSession(sessionId: string) {
        dispatch({ type: "session/opened", sessionId });
        navigation.push(`/session/${sessionId}`);
      },
      viewSession(sessionId: string) {
        dispatch({ type: "session/opened", sessionId });
        navigation.push(`/session/${sessionId}`);
      },
    }),
    [
      bootstrapStatus,
      client,
      connectionStatus,
      hasLoadedSessionList,
      loadDeviceIdentity,
      navigation,
      profile,
      profileRepository,
      sessionState,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
