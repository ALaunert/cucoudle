import { useLocalSearchParams } from "expo-router";

import { useApp } from "../../application/useApp";
import {
  SessionScreen,
  type SessionConnectionStatus,
} from "../../features/session/SessionScreen";

export function normalizeSessionRouteId(
  value: string | readonly string[] | undefined,
): string {
  const values = Array.isArray(value) ? value : [value];
  return values.find((candidate) => candidate?.trim())?.trim() ?? "";
}

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const app = useApp();
  const sessionId = normalizeSessionRouteId(id);
  const connectionStatus: SessionConnectionStatus =
    app.connectionStatus === "online"
      ? "online"
      : app.connectionStatus === "offline"
        ? "offline"
        : app.connectionStatus === "resyncing"
          ? "resyncing"
          : app.connectionStatus === "recovery"
            ? "recovery"
            : "reconnecting";

  return (
    <SessionScreen
      connectionStatus={connectionStatus}
      negotiatedCapabilities={app.negotiatedCapabilities}
      onInterrupt={app.interruptSession}
      onOpenSession={app.openSession}
      onRespondInteraction={app.respondInteraction}
      onSendInput={app.sendInput}
      sessionId={sessionId}
      state={app.sessionState}
      structuredInteraction={app.sessionState.activeInteractionsBySessionId[sessionId]}
    />
  );
}
