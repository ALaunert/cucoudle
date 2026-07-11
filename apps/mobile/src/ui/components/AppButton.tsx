import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, typography } from "../theme";

export type AppButtonVariant = "primary" | "secondary" | "destructive";

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  testID?: string;
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  loadingLabel = "Загрузка…",
  testID,
}: AppButtonProps) {
  const isDisabled = disabled || loading;
  const accessibleLabel = loading ? loadingLabel : label;

  return (
    <Pressable
      accessibilityLabel={accessibleLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && !isDisabled && styles[`${variant}Pressed`],
        isDisabled && styles.disabled,
      ]}
      testID={testID}
    >
      {loading ? (
        <ActivityIndicator
          accessibilityElementsHidden
          color={isDisabled ? colors.disabledText : textColors[variant]}
          importantForAccessibility="no-hide-descendants"
          size="small"
        />
      ) : null}
      <Text
        style={[
          styles.label,
          { color: textColors[variant] },
          isDisabled && styles.disabledLabel,
        ]}
      >
        {accessibleLabel}
      </Text>
    </Pressable>
  );
}

const textColors: Record<AppButtonVariant, string> = {
  primary: colors.primaryText,
  secondary: colors.text,
  destructive: colors.destructiveText,
};

const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.secondary },
  secondaryPressed: { backgroundColor: colors.secondaryPressed },
  destructive: { backgroundColor: colors.destructive },
  destructivePressed: { backgroundColor: colors.destructivePressed },
  disabled: { backgroundColor: colors.disabled, opacity: 0.8 },
  label: {
    fontSize: typography.label,
    fontWeight: "700",
    textAlign: "center",
  },
  disabledLabel: { color: colors.disabledText },
});
