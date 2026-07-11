import type {
  InteractionResponse,
  SessionInputParams,
} from "@cucoudle/protocol";

import type {
  PairingProfile,
  PairingResult,
  PairingTransportRequest,
} from "../pairing/pairingProfile";
import type { PairingRepository } from "../pairing/pairingRepository";
import { createMobileClient, type MobileClient } from "../protocol/mobileClient";
import type { SessionAction, SessionSubscribeResult } from "../state/sessionState";
import {
  createConnectionCoordinator,
  type ConnectionCoordinatorDependencies,
  type ConnectionCoordinatorStatus,
  type OpenSessionRecovery,
} from "./connectionCoordinator";
import type { AppNavigation } from "./useApp";

export type MobileRuntimeDependencies = {
  client: MobileClient;
  pairingClient?: MobileClient;
  profileRepository: PairingRepository;
  dispatch(action: SessionAction): void;
  navigation: AppNavigation;
  getOpenSession(): OpenSessionRecovery | undefined;
  onStatusChange?(status: ConnectionCoordinatorStatus): void;
  onProfileInvalidated?(profile: PairingProfile): void | Promise<void>;
  onCapabilitiesChange?(capabilities: ReadonlySet<string> | undefined): void;
  reconnectDelayMs?: number;
  timers?: ConnectionCoordinatorDependencies["timers"];
};

export type MobileRuntime = {
  start(profile: PairingProfile | null): Promise<void>;
  pair(request: PairingTransportRequest): Promise<PairingResult>;
  openSession(sessionId: string): Promise<void>;
  sendInput(params: SessionInputParams): Promise<{ accepted: boolean; bytesWritten?: number }>;
  interrupt(params: { sessionId: string }): Promise<unknown>;
  respondInteraction(params: {
    sessionId: string;
    interactionId: string;
    response: InteractionResponse;
  }): Promise<unknown>;
  retry(): Promise<void>;
  dispose(): void;
};

export function createMobileRuntime(
  dependencies: MobileRuntimeDependencies,
): MobileRuntime {
  const pairingClient = dependencies.pairingClient ?? createMobileClient();
  const subscribingSessionIds = new Set<string>();
  let latestOpenSessionId: string | undefined;
  let disposed = false;

  const coordinator = createConnectionCoordinator({
    client: dependencies.client,
    dispatch: dependencies.dispatch,
    getOpenSession: dependencies.getOpenSession,
    onStatusChange: dependencies.onStatusChange,
    onCapabilitiesChange: dependencies.onCapabilitiesChange,
    reconnectDelayMs: dependencies.reconnectDelayMs,
    timers: dependencies.timers,
    onProfileInvalidated: dependencies.onProfileInvalidated ?? (async () => {
      await dependencies.profileRepository.clear();
    }),
  });

  return {
    async start(profile) {
      await coordinator.start(profile);
      if (!profile) dependencies.client.close();
    },

    async pair(request) {
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

    async openSession(sessionId) {
      latestOpenSessionId = sessionId;
      dependencies.dispatch({ type: "session/opened", sessionId });
      dependencies.navigation.push(`/session/${sessionId}`);
      if (
        disposed ||
        coordinator.getSnapshot().status !== "online" ||
        subscribingSessionIds.has(sessionId)
      ) {
        return;
      }

      subscribingSessionIds.add(sessionId);
      const openSession = dependencies.getOpenSession();
      const params: Record<string, unknown> = { sessionId };
      if (openSession?.sessionId === sessionId && openSession.afterSeq !== undefined) {
        params.afterSeq = openSession.afterSeq;
      }
      try {
        const result = await dependencies.client.request<SessionSubscribeResult>(
          "session.subscribe",
          params,
        );
        if (!disposed && latestOpenSessionId === sessionId) {
          dependencies.dispatch({ type: "session/subscribeReceived", result });
        }
      } catch {
        // Connection recovery owns retry; mutating operations are never replayed here.
      } finally {
        subscribingSessionIds.delete(sessionId);
      }
    },

    sendInput(params) {
      return dependencies.client.request(
        "session.input",
        params as unknown as Record<string, unknown>,
      );
    },

    interrupt(params) {
      return dependencies.client.request("session.interrupt", params);
    },

    respondInteraction(params) {
      return dependencies.client.request("interaction.respond", params);
    },

    retry() {
      return coordinator.retry();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      coordinator.dispose();
      pairingClient.close();
    },
  };
}
