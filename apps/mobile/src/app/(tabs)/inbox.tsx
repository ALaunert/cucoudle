import { InboxScreen } from "../../features/inbox/InboxScreen";
import { useApp } from "../../application/useApp";

export default function InboxRoute() {
  const app = useApp();
  const connectionStatus =
    app.connectionStatus === "online"
      ? "connected"
      : app.connectionStatus === "offline"
        ? "offline"
        : app.connectionStatus === "resyncing"
          ? "resyncing"
          : app.connectionStatus === "recovery"
            ? "recovery"
            : "reconnecting";

  return (
    <InboxScreen
      canMutate={app.connectionStatus === "online"}
      connectionStatus={connectionStatus}
      activeInteractions={app.sessionState.activeInteractionsBySessionId}
      negotiatedCapabilities={app.negotiatedCapabilities}
      onDismissAttention={app.dismissAttention}
      onOpenSession={app.openSession}
      onRespondInteraction={app.respondInteraction}
      onViewSession={app.viewSession}
      state={app.sessionState}
    />
  );
}
