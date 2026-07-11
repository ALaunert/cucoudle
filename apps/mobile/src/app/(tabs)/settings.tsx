import { PROTOCOL_VERSION } from "@cucoudle/protocol";
import Constants from "expo-constants";

import { useApp } from "../../application/useApp";
import { SettingsScreen } from "../../features/settings/SettingsScreen";

export default function SettingsRoute() {
  const app = useApp();

  return (
    <SettingsScreen
      appVersion={Constants.expoConfig?.version ?? "1.0.0"}
      connectionStatus={app.connectionStatus}
      onRePair={() => void app.clearPairing()}
      onReplaceComputer={() => void app.clearPairing()}
      onRetry={() => void app.retryConnection()}
      profile={app.profile}
      protocolVersion={PROTOCOL_VERSION}
    />
  );
}
