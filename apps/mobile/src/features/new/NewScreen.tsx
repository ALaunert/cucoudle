import { Alert, StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../ui/components/AppButton";
import { AppScreen } from "../../ui/components/AppScreen";
import { colors, radii, spacing, typography } from "../../ui/theme";

export type ActiveComputer = {
  id: string;
  name: string;
};

export type NewScreenProps = {
  activeComputer: ActiveComputer | null;
  onPairComputer(): void;
};

export function NewScreen({ activeComputer, onPairComputer }: NewScreenProps) {
  const handlePairComputer = () => {
    if (!activeComputer) {
      onPairComputer();
      return;
    }

    Alert.alert(
      "Заменить подключённый компьютер?",
      `Сейчас активен «${activeComputer.name}». Новое подключение заменит его.`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Заменить", style: "destructive", onPress: onPairComputer },
      ],
    );
  };

  return (
    <AppScreen contentStyle={styles.screen} testID="new-screen">
      <Text accessibilityRole="header" style={styles.title}>Новая</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Подключить компьютер</Text>
        <Text style={styles.description}>
          Отсканируйте QR-код с компьютера, чтобы управлять его сессиями.
        </Text>
        {activeComputer ? (
          <Text style={styles.currentComputer}>
            Активный компьютер: {activeComputer.name}
          </Text>
        ) : null}
        <AppButton label="Подключить компьютер" onPress={handlePairComputer} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Запустить сессию</Text>
        <Text style={styles.description}>
          Запуск запланирован: desktop launch contract ещё не реализован.
        </Text>
        <AppButton disabled label="Запустить сессию" onPress={() => undefined} />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  title: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "800",
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardTitle: { color: colors.text, fontSize: typography.body, fontWeight: "800" },
  description: { color: colors.textMuted, fontSize: typography.body, lineHeight: 23 },
  currentComputer: { color: colors.text, fontSize: typography.caption },
});
