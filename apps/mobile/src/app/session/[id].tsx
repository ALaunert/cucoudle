import { useLocalSearchParams } from "expo-router";

import { useApp } from "../../application/useApp";
import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { EmptyState } from "../../ui/components/EmptyState";

export default function SessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  return (
    <AppScreen>
      <EmptyState
        action={
          <AppButton
            label="К списку сессий"
            onPress={() => app.navigation.replace("/(tabs)/sessions")}
            variant="secondary"
          />
        }
        description="Live terminal и controls будут подключены в следующей волне."
        title={`Сессия ${id ?? ""}`.trim()}
      />
    </AppScreen>
  );
}
