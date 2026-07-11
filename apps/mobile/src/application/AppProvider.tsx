import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { router } from "expo-router";

import type { MobileDevice } from "@cucoudle/protocol";
import { getOrCreateDeviceIdentity } from "../pairing/deviceIdentity";
import type { PairingProfile, PairingResult, PairingTransportRequest } from "../pairing/pairingProfile";
import {
  createPairingRepository,
  type PairingRepository,
} from "../pairing/pairingRepository";
import { createMobileClient, type MobileClient } from "../protocol/mobileClient";
import { sessionReducer } from "../state/sessionReducer";
import { createInitialSessionState } from "../state/sessionState";
import { createMobileRuntime, type MobileRuntime } from "./createMobileRuntime";
import {
  AppContext,
  type AppConnectionStatus,
  type AppNavigation,
} from "./useApp";

type AppProviderDependencies = {
  navigation?: AppNavigation;
  profileRepository?: PairingRepository;
  client?: MobileClient;
  pairingClient?: MobileClient;
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
  const pairingClient = useRef(
    dependencies?.pairingClient ?? createMobileClient(),
  ).current;
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
  const [hasLoadedSessionList, setHasLoadedSessionList] = useState(false);
  const [negotiatedCapabilities, setNegotiatedCapabilities] =
    useState<ReadonlySet<string>>();
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const exitRecoveryOnOnlineRef = useRef(false);
  const runtimeRef = useRef<MobileRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = createMobileRuntime({
      client,
      pairingClient,
      profileRepository,
      navigation,
      dispatch: (action) => {
        dispatch(action);
        if (action.type === "session/listReceived") setHasLoadedSessionList(true);
      },
      getOpenSession: () => {
        const sessionId = sessionStateRef.current.openSessionId;
        if (!sessionId) return undefined;
        const lastSeq = sessionStateRef.current.terminalBySessionId[sessionId]?.lastSeq;
        return {
          sessionId,
          ...(lastSeq === undefined ? {} : { afterSeq: lastSeq }),
        };
      },
      onStatusChange: (status) => {
        const appStatus = status === "connecting" ? "reconnecting" : status;
        setConnectionStatus(appStatus);
        if (status === "recovery") {
          exitRecoveryOnOnlineRef.current = true;
          navigation.replace("/recovery");
        }
        if (status === "pairingRequired") {
          exitRecoveryOnOnlineRef.current = false;
          navigation.replace("/pairing");
        }
        if (status === "online" && exitRecoveryOnOnlineRef.current) {
          exitRecoveryOnOnlineRef.current = false;
          navigation.replace("/(tabs)/inbox");
        }
      },
      onProfileInvalidated: async () => {
        await profileRepository.clear();
        setProfile(null);
      },
      onCapabilitiesChange: setNegotiatedCapabilities,
    });
  }
  const runtime = runtimeRef.current;

  const openSessionDetail = useCallback((sessionId: string) => {
    void runtime.openSession(sessionId);
  }, [runtime]);

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
        if (restored) void runtime.start(restored);
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
  }, [navigation, profileRepository, runtime]);

  useEffect(
    () => () => {
      runtime.dispose();
    },
    [runtime],
  );

  const value = useMemo(
    () => ({
      bootstrapStatus,
      connectionStatus,
      profile,
      sessionState,
      hasLoadedSessionList,
      negotiatedCapabilities,
      client,
      profileRepository,
      navigation,
      dispatch,
      pair(request: PairingTransportRequest): Promise<PairingResult> {
        return runtime.pair(request);
      },
      saveProfile(nextProfile: PairingProfile) {
        return profileRepository.replace(nextProfile);
      },
      getDeviceIdentity: loadDeviceIdentity,
      onPaired(nextProfile: PairingProfile) {
        setProfile(nextProfile);
        setConnectionStatus("reconnecting");
        navigation.replace("/(tabs)/inbox");
        void runtime.start(nextProfile);
      },
      dismissAttention(key: string) {
        dispatch({ type: "attention/dismissed", key });
      },
      openSession(sessionId: string) {
        openSessionDetail(sessionId);
      },
      viewSession(sessionId: string) {
        openSessionDetail(sessionId);
      },
      retryConnection() {
        return runtime.retry();
      },
      pairAnotherComputer() {
        navigation.push("/pairing");
      },
      async clearPairing() {
        await runtime.start(null);
        await profileRepository.clear();
        setProfile(null);
      },
      sendInput(params: import("@cucoudle/protocol").SessionInputParams) {
        return runtime.sendInput(params);
      },
      interruptSession(params: { sessionId: string }) {
        return runtime.interrupt(params);
      },
      respondInteraction(params: {
        sessionId: string;
        interactionId: string;
        response: import("@cucoudle/protocol").InteractionResponse;
      }) {
        return runtime.respondInteraction(params);
      },
    }),
    [
      bootstrapStatus,
      client,
      connectionStatus,
      hasLoadedSessionList,
      loadDeviceIdentity,
      navigation,
      negotiatedCapabilities,
      openSessionDetail,
      profile,
      profileRepository,
      runtime,
      sessionState,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
