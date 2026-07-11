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
  const isWaiting = session.status === "waiting";
  const statusLabel = isWaiting ? "Ждёт вашего ответа" : session.status;

  return (
    <Pressable
      accessibilityHint={`Открывает /session/${session.id}`}
      accessibilityLabel={`${session.title}, ${session.agent}, ${project}, ${statusLabel}, ${activity}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isWaiting && styles.waitingRow,
        pressed && styles.pressed,
      ]}
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
          accessibilityLabel={`Статус: ${statusLabel.toLocaleLowerCase("ru-RU")}`}
          style={[styles.status, isWaiting && styles.waitingStatus]}
        >
          <Text style={[styles.statusText, isWaiting && styles.waitingStatusText]}>
            {statusLabel}
          </Text>
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
  waitingRow: {
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionSurface,
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
  waitingStatus: {
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionText,
  },
  statusText: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  waitingStatusText: { color: colors.background },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  project: { flex: 1, color: colors.textMuted, fontSize: typography.caption },
  activity: { color: colors.textMuted, fontSize: typography.caption },
});
