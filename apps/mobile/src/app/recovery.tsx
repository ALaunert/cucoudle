import { useApp } from "../application/useApp";
import { ConnectionRecoveryScreen } from "../features/pairing/ConnectionRecoveryScreen";

export default function RecoveryRoute() {
  const app = useApp();
  return (
    <ConnectionRecoveryScreen
      onPairAnotherComputer={app.pairAnotherComputer}
      onRetry={() => void app.retryConnection()}
    />
  );
}
