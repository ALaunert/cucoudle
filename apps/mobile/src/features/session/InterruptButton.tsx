import { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { AppButton } from "../../ui/components/AppButton";
import { colors, spacing, typography } from "../../ui/theme";

export type InterruptSession = (params: { sessionId: string }) => Promise<unknown>;

type InterruptButtonProps = {
  sessionId: string;
  disabled: boolean;
  onInterrupt: InterruptSession;
};

export function InterruptButton({
  sessionId,
  disabled,
  onInterrupt,
}: InterruptButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(false);

  async function interrupt() {
    if (disabled || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onInterrupt({ sessionId });
    } catch (interruptError) {
      setError(
        interruptError instanceof Error
          ? interruptError.message
          : "Не удалось прервать сессию",
      );
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      <AppButton
        disabled={disabled}
        label="Прервать"
        loading={pending}
        loadingLabel="Прерываем…"
        onPress={() => void interrupt()}
        testID="session-interrupt"
        variant="destructive"
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "flex-end", gap: spacing.xs },
  error: { color: colors.destructive, fontSize: typography.caption },
});
