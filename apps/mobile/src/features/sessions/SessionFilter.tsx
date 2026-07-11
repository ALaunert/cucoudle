import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SessionFilter as SessionFilterValue } from "../../state/inboxSelectors";
import { colors, radii, spacing, typography } from "../../ui/theme";

type SessionFilterProps = {
  value: SessionFilterValue;
  onChange(value: SessionFilterValue): void;
};

const options: { label: string; value: SessionFilterValue }[] = [
  { label: "Все", value: "all" },
  { label: "Активные", value: "active" },
  { label: "Завершённые", value: "completed" },
];

export function SessionFilter({ value, onChange }: SessionFilterProps) {
  return (
    <View accessibilityRole="tablist" style={styles.container}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.option,
              selected && styles.selected,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  option: {
    minHeight: 44,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radii.small,
  },
  selected: { backgroundColor: colors.primary },
  pressed: { opacity: 0.75 },
  label: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: "700",
  },
  selectedLabel: { color: colors.primaryText },
});
