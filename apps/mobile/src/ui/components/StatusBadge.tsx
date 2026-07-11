import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../theme";

export type StatusBadgeStatus =
  | "connected"
  | "active"
  | "waiting"
  | "offline"
  | "error";

type StatusBadgeProps = {
  status: StatusBadgeStatus;
  testID?: string;
};

const labels: Record<StatusBadgeStatus, string> = {
  connected: "Подключено",
  active: "В работе",
  waiting: "Ожидание",
  offline: "Офлайн",
  error: "Ошибка",
};

export function StatusBadge({ status, testID }: StatusBadgeProps) {
  return (
    <View style={[styles.badge, styles[status]]} testID={testID}>
      <Text style={[styles.label, status === "waiting" && styles.darkLabel]}>
        {labels[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  connected: { borderColor: colors.success, backgroundColor: colors.surfaceRaised },
  active: { borderColor: colors.activity, backgroundColor: colors.surfaceRaised },
  waiting: {
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionText,
  },
  offline: { borderColor: colors.textMuted, backgroundColor: colors.surfaceRaised },
  error: { borderColor: colors.destructive, backgroundColor: colors.surfaceRaised },
  label: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  darkLabel: { color: colors.background },
});
