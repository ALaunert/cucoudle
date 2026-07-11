import { StyleSheet, Text, View } from "react-native";

import type { ActivityFact } from "../../state/sessionState";
import { colors, radii, spacing, typography } from "../../ui/theme";

type ActivityRowProps = {
  activity: ActivityFact;
};

const activityLabels: Record<ActivityFact["type"], string> = {
  created: "Сессия создана",
  updated: "Сессия обновлена",
  ended: "Сессия завершена",
  removed: "Сессия удалена",
};

export function ActivityRow({ activity }: ActivityRowProps) {
  return (
    <View style={styles.row} testID={`activity-${activity.id}`}>
      <View accessibilityElementsHidden style={styles.marker} />
      <View style={styles.copy}>
        <Text style={styles.label}>{activityLabels[activity.type]}</Text>
        <Text numberOfLines={2} style={styles.title}>
          {activity.title ?? activity.sessionId}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  marker: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: colors.activity,
  },
  copy: { flex: 1, gap: spacing.xs },
  label: { color: colors.text, fontSize: typography.body, fontWeight: "700" },
  title: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 19 },
});
