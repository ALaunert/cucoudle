import type { PropsWithChildren } from "react";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { router } from "expo-router";

import type { MobileDevice, SessionInputParams } from "@cucoudle/protocol";
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
import type { SessionSubscribeResult } from "../state/sessionState";
import {
  createConnectionCoordinator,
  type ConnectionCoordinator,
} from "./connectionCoordinator";
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
  const coordinatorRef = useRef<ConnectionCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = createConnectionCoordinator({
      client,
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
  const coordinator = coordinatorRef.current;
  const subscribingSessionIds = useRef(new Set<string>());
  const latestOpenSessionIdRef = useRef<string | undefined>(undefined);

  const openSessionDetail = useCallback((sessionId: string) => {
    latestOpenSessionIdRef.current = sessionId;
    dispatch({ type: "session/opened", sessionId });
    navigation.push(`/session/${sessionId}`);
    if (connectionStatus !== "online" || subscribingSessionIds.current.has(sessionId)) {
      return;
    }
    subscribingSessionIds.current.add(sessionId);
    const lastSeq = sessionStateRef.current.terminalBySessionId[sessionId]?.lastSeq;
    const params: Record<string, unknown> = {
      sessionId,
      ...(lastSeq === undefined ? {} : { afterSeq: lastSeq }),
    };
    void client
      .request<SessionSubscribeResult>("session.subscribe", params)
      .then((result) => {
        if (latestOpenSessionIdRef.current !== sessionId) return;
        dispatch({ type: "session/subscribeReceived", result });
      })
      .catch(() => undefined)
      .finally(() => subscribingSessionIds.current.delete(sessionId));
  }, [client, connectionStatus, navigation]);

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
        if (restored) void coordinator.start(restored);
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
  }, [coordinator, navigation, profileRepository]);

  useEffect(
    () => () => {
      coordinator.dispose();
      pairingClient.close();
    },
    [coordinator, pairingClient],
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
      pairingClient,
      navigation,
      dispatch,
      async pair(request: PairingTransportRequest): Promise<PairingResult> {
        try {
          await pairingClient.connect(request.relayWsUrl);
          return await pairingClient.request<PairingResult>("mobile.pair", {
            desktopId: request.desktopId,
            pairingCode: request.pairingCode,
            mobileDevice: request.mobileDevice,
          });
        } finally {
          pairingClient.close();
        }
      },
      saveProfile(nextProfile: PairingProfile) {
        return profileRepository.replace(nextProfile);
      },
      getDeviceIdentity: loadDeviceIdentity,
      onPaired(nextProfile: PairingProfile) {
        setProfile(nextProfile);
        setConnectionStatus("reconnecting");
        navigation.replace("/(tabs)/inbox");
        void coordinator.start(nextProfile);
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
        return coordinator.retry();
      },
      pairAnotherComputer() {
        navigation.push("/pairing");
      },
      async clearPairing() {
        await coordinator.start(null);
        client.close();
        await profileRepository.clear();
        setProfile(null);
      },
      sendInput(params: SessionInputParams) {
        return client.request<{ accepted: boolean; bytesWritten?: number }>(
          "session.input",
          params as unknown as Record<string, unknown>,
        );
      },
      interruptSession(params: { sessionId: string }) {
        return client.request("session.interrupt", params);
      },
      respondInteraction(params: {
        sessionId: string;
        interactionId: string;
        response: import("@cucoudle/protocol").InteractionResponse;
      }) {
        return client.request("interaction.respond", params);
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
      pairingClient,
      profile,
      profileRepository,
      coordinator,
      sessionState,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
