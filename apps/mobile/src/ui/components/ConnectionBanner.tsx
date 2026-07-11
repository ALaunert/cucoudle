import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../theme";

export type ConnectionStatus =
  | "reconnecting"
  | "offline"
  | "resyncing"
  | "recovery";

type ConnectionBannerProps = {
  status: ConnectionStatus;
  testID?: string;
};

const content: Record<ConnectionStatus, { label: string; message: string }> = {
  reconnecting: {
    label: "Переподключение",
    message: "Восстанавливаем соединение…",
  },
  offline: {
    label: "Офлайн",
    message: "Нет соединения. Изменения сохранятся на устройстве.",
  },
  resyncing: {
    label: "Синхронизация",
    message: "Синхронизируем изменения…",
  },
  recovery: {
    label: "Связь восстановлена",
    message: "Соединение восстановлено. Все изменения синхронизированы.",
  },
};

export function ConnectionBanner({ status, testID }: ConnectionBannerProps) {
  const { label, message } = content[status];

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[styles.banner, status === "recovery" && styles.recovery]}
      testID={testID}
    >
      <Text style={[styles.label, status === "recovery" && styles.recoveryLabel]}>
        {label}
      </Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionSurface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  recovery: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceRaised,
  },
  label: {
    color: colors.attentionText,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  recoveryLabel: { color: colors.primary },
  message: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 23,
  },
});
