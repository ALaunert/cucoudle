import { useApp } from "../../application/useApp";
import { NewScreen } from "../../features/new/NewScreen";

export default function NewRoute() {
  const app = useApp();
  return (
    <NewScreen
      activeComputer={app.profile ? {
        id: app.profile.desktopId,
        name: app.profile.desktopName,
      } : null}
      onPairComputer={() => app.navigation.push("/pairing")}
    />
  );
}
