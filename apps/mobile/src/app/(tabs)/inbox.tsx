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
      connectionStatus={connectionStatus}
      onDismissAttention={app.dismissAttention}
      onOpenSession={app.openSession}
      onViewSession={app.viewSession}
      state={app.sessionState}
    />
  );
}
