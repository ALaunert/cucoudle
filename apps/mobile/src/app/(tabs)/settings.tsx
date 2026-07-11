import { Text } from "react-native";

import { useApp } from "../../application/useApp";
import { AppScreen } from "../../ui/components/AppScreen";
import { EmptyState } from "../../ui/components/EmptyState";
import { colors, typography } from "../../ui/theme";

export default function SettingsRoute() {
  const app = useApp();
  return (
    <AppScreen>
      <EmptyState
        description={`Состояние подключения: ${app.connectionStatus}`}
        illustration={
          <Text style={{ color: colors.text, fontSize: typography.body }}>
            {app.profile?.desktopName ?? "Компьютер не подключён"}
          </Text>
        }
        title="Настройки"
      />
    </AppScreen>
  );
}
