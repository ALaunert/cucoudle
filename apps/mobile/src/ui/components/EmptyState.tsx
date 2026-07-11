import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../theme";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  illustration?: ReactNode;
  testID?: string;
};

export function EmptyState({
  title,
  description,
  action,
  illustration,
  testID,
}: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      {illustration}
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.lg,
  },
  copy: { alignItems: "center", gap: spacing.sm },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "800",
    textAlign: "center",
  },
  description: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 24,
    textAlign: "center",
  },
  action: { alignSelf: "stretch" },
});
