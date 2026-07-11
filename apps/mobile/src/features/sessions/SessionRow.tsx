import type { Session } from "@cucoudle/protocol";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../../ui/theme";

type SessionRowProps = {
  session: Session;
  onPress(): void;
};

export function projectLabel(cwd: string): string {
  const normalized = cwd.replace(/[\\/]+$/, "");
  return normalized.split(/[\\/]/).pop() || cwd;
}

function activityLabel(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return value;
  return new Date(timestamp).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionRow({ session, onPress }: SessionRowProps) {
  const project = projectLabel(session.cwd);
  const activity = activityLabel(session.lastActivityAt);

  return (
    <Pressable
      accessibilityHint={`Открывает /session/${session.id}`}
      accessibilityLabel={`${session.title}, ${session.agent}, ${project}, ${session.status}, ${activity}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={`session-row-${session.id}`}
    >
      <View style={styles.heading}>
        <View style={styles.titleGroup}>
          <Text style={styles.agent}>{session.agent}</Text>
          <Text numberOfLines={1} style={styles.title}>
            {session.title}
          </Text>
        </View>
        <View
          accessibilityLabel={`Статус: ${session.status}`}
          style={styles.status}
        >
          <Text style={styles.statusText}>{session.status}</Text>
        </View>
      </View>
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.project}>
          {project}
        </Text>
        <Text style={styles.activity}>{activity}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  titleGroup: { flex: 1, gap: spacing.xs },
  agent: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
  },
  status: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.activity,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceRaised,
  },
  statusText: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  project: { flex: 1, color: colors.textMuted, fontSize: typography.caption },
  activity: { color: colors.textMuted, fontSize: typography.caption },
});
