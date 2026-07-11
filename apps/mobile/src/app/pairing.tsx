import { PairingScreen } from "../features/pairing/PairingScreen";
import { useApp } from "../application/useApp";

export default function PairingRoute() {
  const app = useApp();
  return (
    <PairingScreen
      getDeviceIdentity={app.getDeviceIdentity}
      onPaired={app.onPaired}
      pair={app.pair}
      saveProfile={app.saveProfile}
    />
  );
}
