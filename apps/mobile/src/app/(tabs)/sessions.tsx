import { useApp } from "../../application/useApp";
import { SessionsScreen } from "../../features/sessions/SessionsScreen";

export default function SessionsRoute() {
  const app = useApp();
  const connectionStatus =
    app.connectionStatus === "online"
      ? "online"
      : app.connectionStatus === "offline"
        ? "offline"
        : "reconnecting";

  return (
    <SessionsScreen
      connectionStatus={connectionStatus}
      hasLoadedSessionList={app.hasLoadedSessionList}
      onOpenSession={app.openSession}
      state={app.sessionState}
    />
  );
}
