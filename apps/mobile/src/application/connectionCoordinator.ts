import type { Session } from "@cucoudle/protocol";

import type { PairingProfile } from "../pairing/pairingProfile";
import type { MobileClient } from "../protocol/mobileClient";
import type { SessionAction, SessionSubscribeResult } from "../state/sessionState";

export type ConnectionCoordinatorStatus =
  | "idle"
  | "connecting"
  | "online"
  | "reconnecting"
  | "resyncing"
  | "recovery"
  | "pairingRequired";

export type ConnectionCoordinatorSnapshot = {
  status: ConnectionCoordinatorStatus;
  profile: PairingProfile | null;
  canMutate: boolean;
  negotiatedCapabilities?: ReadonlySet<string>;
};

export type OpenSessionRecovery = {
  sessionId: string;
  afterSeq?: number;
};

type TimerHandle = ReturnType<typeof setTimeout>;

export type ConnectionCoordinatorDependencies = {
  client: MobileClient;
  dispatch(action: SessionAction): void;
  getOpenSession(): OpenSessionRecovery | undefined;
  onStatusChange?(status: ConnectionCoordinatorStatus): void;
  onProfileInvalidated?(profile: PairingProfile): void | Promise<void>;
  onCapabilitiesChange?(capabilities: ReadonlySet<string> | undefined): void;
  reconnectDelayMs?: number;
  timers?: {
    setTimeout(callback: () => void, delayMs: number): TimerHandle;
    clearTimeout(handle: TimerHandle): void;
  };
};

export type ConnectionCoordinator = {
  start(profile: PairingProfile | null): Promise<void>;
  retry(): Promise<void>;
  getSnapshot(): ConnectionCoordinatorSnapshot;
  dispose(): void;
};

const pairingRequiredCodes = new Set([
  "UNAUTHORIZED",
  "PAIRING_EXPIRED",
  "PAIRING_NOT_FOUND",
  "MOBILE_NOT_PAIRED",
]);
const recoveryCodes = new Set(["DESKTOP_OFFLINE", "DAEMON_UNAVAILABLE"]);
const MAX_DEMO_RECONNECT_DELAY_MS = 5_000;

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function negotiatedCapabilities(value: unknown): Set<string> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const capabilities = (value as { negotiatedCapabilities?: unknown }).negotiatedCapabilities;
  if (!Array.isArray(capabilities) || !capabilities.every((item) => typeof item === "string")) {
    return undefined;
  }
  return new Set(capabilities);
}

export function createConnectionCoordinator(
  dependencies: ConnectionCoordinatorDependencies,
): ConnectionCoordinator {
  const timers = dependencies.timers ?? {
    setTimeout: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    clearTimeout: (handle: TimerHandle) => clearTimeout(handle),
  };
  const reconnectDelayMs = Math.min(
    MAX_DEMO_RECONNECT_DELAY_MS,
    Math.max(0, dependencies.reconnectDelayMs ?? 1_000),
  );
  let status: ConnectionCoordinatorStatus = "idle";
  let profile: PairingProfile | null = null;
  let capabilities: Set<string> | undefined;
  let reconnectTimer: TimerHandle | undefined;
  let disposed = false;
  let runVersion = 0;
  let hasActiveTransport = false;
  let replacingTransport = false;

  function setStatus(nextStatus: ConnectionCoordinatorStatus) {
    if (disposed || status === nextStatus) return;
    status = nextStatus;
    dependencies.onStatusChange?.(status);
  }

  function setCapabilities(next: Set<string> | undefined) {
    if (!next) return;
    capabilities = next;
    dependencies.onCapabilitiesChange?.(new Set(next));
  }

  function cancelReconnect() {
    if (reconnectTimer === undefined) return;
    timers.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }

  function scheduleReconnect() {
    if (disposed || !profile || reconnectTimer !== undefined) return;
    setStatus("reconnecting");
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = undefined;
      void synchronize("reconnecting");
    }, reconnectDelayMs);
  }

  function closeActiveTransport() {
    if (!hasActiveTransport) return;
    replacingTransport = true;
    try {
      dependencies.client.close();
    } finally {
      hasActiveTransport = false;
      replacingTransport = false;
    }
  }

  async function handleFailure(error: unknown, activeProfile: PairingProfile) {
    if (disposed) return;
    const code = errorCode(error);
    if (code && pairingRequiredCodes.has(code)) {
      cancelReconnect();
      profile = null;
      capabilities = undefined;
      dependencies.onCapabilitiesChange?.(undefined);
      await dependencies.onProfileInvalidated?.(activeProfile);
      if (!disposed) setStatus("pairingRequired");
      return;
    }
    if (code && recoveryCodes.has(code)) {
      cancelReconnect();
      setStatus("recovery");
      return;
    }
    scheduleReconnect();
  }

  async function synchronize(entryStatus: "connecting" | "reconnecting") {
    const activeProfile = profile;
    if (disposed || !activeProfile) return;
    const version = ++runVersion;
    setStatus(entryStatus);
    try {
      closeActiveTransport();
      await dependencies.client.connect(activeProfile.relayWsUrl);
      if (disposed || version !== runVersion) return;
      hasActiveTransport = true;
      setStatus("resyncing");
      if (capabilities) {
        capabilities = undefined;
        dependencies.onCapabilitiesChange?.(undefined);
      }

      const resume = await dependencies.client.request<unknown>("mobile.resume", {
        desktopId: activeProfile.desktopId,
        mobileDeviceId: activeProfile.mobileDeviceId,
        mobileSessionToken: activeProfile.mobileSessionToken,
      });
      if (disposed || version !== runVersion) return;
      setCapabilities(negotiatedCapabilities(resume));

      const list = await dependencies.client.request<{ sessions: Session[] }>("session.list", {});
      if (disposed || version !== runVersion) return;
      setCapabilities(negotiatedCapabilities(list));
      dependencies.dispatch({ type: "session/listReceived", sessions: list.sessions });

      const openSession = dependencies.getOpenSession();
      if (openSession) {
        const params: Record<string, unknown> = { sessionId: openSession.sessionId };
        if (openSession.afterSeq !== undefined) params.afterSeq = openSession.afterSeq;
        const result = await dependencies.client.request<SessionSubscribeResult>(
          "session.subscribe",
          params,
        );
        if (disposed || version !== runVersion) return;
        setCapabilities(negotiatedCapabilities(result));
        dependencies.dispatch({ type: "session/subscribeReceived", result });
      }
      if (!disposed && version === runVersion) setStatus("online");
    } catch (error) {
      if (version === runVersion) await handleFailure(error, activeProfile);
    }
  }

  const unsubscribeConnection = dependencies.client.onConnection((connection) => {
    if (connection === "disconnected") hasActiveTransport = false;
    if (
      connection === "disconnected" &&
      !replacingTransport &&
      status !== "idle" &&
      status !== "recovery" &&
      status !== "pairingRequired"
    ) {
      scheduleReconnect();
    }
  });
  const unsubscribeEvents = dependencies.client.onEvent((event) => {
    if (!disposed && status === "online") {
      dependencies.dispatch({ type: "event/received", event });
    }
  });

  return {
    async start(nextProfile) {
      cancelReconnect();
      profile = nextProfile;
      if (!profile) {
        capabilities = undefined;
        dependencies.onCapabilitiesChange?.(undefined);
        setStatus("pairingRequired");
        return;
      }
      await synchronize("connecting");
    },

    async retry() {
      if (disposed || !profile) return;
      cancelReconnect();
      await synchronize("reconnecting");
    },

    getSnapshot() {
      return {
        status,
        profile,
        canMutate: status === "online",
        ...(capabilities ? { negotiatedCapabilities: new Set(capabilities) } : {}),
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      runVersion += 1;
      cancelReconnect();
      unsubscribeConnection();
      unsubscribeEvents();
      dependencies.client.close();
    },
  };
}
