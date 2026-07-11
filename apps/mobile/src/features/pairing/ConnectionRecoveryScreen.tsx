import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { colors, radii, spacing, typography } from "../../ui/theme";

export type ConnectionRecoveryScreenProps = {
  onRetry(): void;
  onPairAnotherComputer(): void;
};

export function ConnectionRecoveryScreen({
  onRetry,
  onPairAnotherComputer,
}: ConnectionRecoveryScreenProps) {
  return (
    <AppScreen contentStyle={styles.screen} testID="connection-recovery-screen">
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Подключение сохранено</Text>
        <Text style={styles.title}>Компьютер недоступен</Text>
        <Text style={styles.message}>
          Cucoudle на компьютере или desktop daemon сейчас не отвечает. Запустите
          приложение на компьютере и повторите попытку.
        </Text>
        <Text style={styles.note}>
          Сохранённое подключение останется на этом устройстве.
        </Text>
      </View>

      <View style={styles.actions}>
        <AppButton label="Повторить" onPress={onRetry} />
        <AppButton
          label="Подключить другой компьютер"
          onPress={onPairAnotherComputer}
          variant="secondary"
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    justifyContent: "center",
    gap: spacing.lg,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.cardLarge,
    borderWidth: 1,
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionSurface,
  },
  eyebrow: {
    color: colors.attentionText,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "800",
  },
  message: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 24,
  },
  note: {
    color: colors.textMuted,
    fontSize: typography.body,
    lineHeight: 24,
  },
  actions: { gap: spacing.sm },
});
