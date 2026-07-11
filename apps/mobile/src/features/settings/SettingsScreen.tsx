import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import type { PairingProfile } from "../../pairing/pairingProfile";
import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { colors, radii, spacing, typography } from "../../ui/theme";

export type SettingsConnectionStatus =
  | "idle"
  | "reconnecting"
  | "resyncing"
  | "online"
  | "offline"
  | "recovery"
  | "pairingRequired";

export type SettingsScreenProps = {
  profile: PairingProfile | null;
  connectionStatus: SettingsConnectionStatus;
  protocolVersion: string;
  appVersion: string;
  onRetry(): void;
  onRePair(): void;
  onReplaceComputer(): void;
};

const statusLabels: Record<SettingsConnectionStatus, string> = {
  idle: "Не подключено",
  reconnecting: "Переподключение",
  resyncing: "Синхронизация",
  online: "Подключено",
  offline: "Не в сети",
  recovery: "Связь восстановлена",
  pairingRequired: "Нужно подключение",
};

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function confirmAction(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    { text: "Отмена", style: "cancel" },
    { text: confirmLabel, style: "destructive", onPress: onConfirm },
  ]);
}

export function SettingsScreen({
  profile,
  connectionStatus,
  protocolVersion,
  appVersion,
  onRetry,
  onRePair,
  onReplaceComputer,
}: SettingsScreenProps) {
  return (
    <AppScreen testID="settings-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Настройки</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Подключение</Text>
          <Detail label="Состояние" value={statusLabels[connectionStatus]} />
          <Detail label="Компьютер" value={profile?.desktopName ?? "Не подключён"} />
          <Detail label="ID компьютера" value={profile?.desktopId ?? "—"} />
          <Detail label="Мобильное устройство" value={profile?.mobileDeviceName ?? "—"} />
          <Detail label="ID устройства" value={profile?.mobileDeviceId ?? "—"} />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Версии</Text>
          <Detail label="Протокол" value={protocolVersion} />
          <Detail label="Приложение" value={appVersion} />
        </View>

        <View style={styles.actions}>
          <AppButton label="Повторить подключение" onPress={onRetry} variant="secondary" />
          <AppButton
            label="Подключить заново"
            onPress={() => confirmAction(
              "Подключить компьютер заново?",
              "Текущий профиль будет удалён только после подтверждения.",
              "Подключить заново",
              onRePair,
            )}
            variant="secondary"
          />
          <AppButton
            label="Заменить компьютер"
            onPress={() => confirmAction(
              "Заменить активный компьютер?",
              "Текущее подключение будет удалено, после чего можно подключить другой компьютер.",
              "Заменить",
              onReplaceComputer,
            )}
            variant="destructive"
          />
        </View>

        <Text style={styles.securityNote}>
          Безопасность: секрет сессии хранится в защищённом хранилище устройства.
          Хакатонная версия не реализует управление production-ключами.
        </Text>
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  title: { color: colors.text, fontSize: typography.title, fontWeight: "800" },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  detail: { gap: spacing.xs },
  detailLabel: { color: colors.textMuted, fontSize: typography.caption },
  detailValue: { color: colors.text, fontSize: typography.body },
  actions: { gap: spacing.sm },
  securityNote: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 18 },
});
