import { useApp } from "../../application/useApp";
import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { EmptyState } from "../../ui/components/EmptyState";

export default function NewRoute() {
  const app = useApp();
  return (
    <AppScreen>
      <EmptyState
        action={
          <AppButton
            label="Подключить компьютер"
            onPress={() => app.navigation.push("/pairing")}
          />
        }
        description="Запуск сессии с телефона появится после добавления desktop launch contract."
        title="Новая"
      />
    </AppScreen>
  );
}
