import type { SessionInputParams } from "@cucoudle/protocol";
import { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import { AppButton } from "../../ui/components/AppButton";
import { colors, radii, spacing, typography } from "../../ui/theme";

export type SendSessionInput = (
  params: SessionInputParams,
) => Promise<{ accepted: boolean; bytesWritten?: number }>;

type SessionComposerProps = {
  sessionId: string;
  disabled: boolean;
  onSendInput: SendSessionInput;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Не удалось отправить команду";
}

export function SessionComposer({
  sessionId,
  disabled,
  onSendInput,
}: SessionComposerProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const pendingRef = useRef(false);
  const controlsDisabled = disabled || pending;

  async function send() {
    if (disabled || pendingRef.current || draft.length === 0) return;
    pendingRef.current = true;
    setPending(true);
    setError(undefined);
    try {
      const result = await onSendInput({
        sessionId,
        inputMode: "text",
        data: draft,
        submit: true,
      });
      if (!result.accepted) throw new Error("Команда не принята");
      setDraft("");
    } catch (sendError) {
      setError(errorMessage(sendError));
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Команда"
          editable={!controlsDisabled}
          multiline
          onChangeText={setDraft}
          placeholder="Введите команду"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          value={draft}
        />
        <AppButton
          disabled={controlsDisabled || draft.length === 0}
          label="Отправить"
          loading={pending}
          loadingLabel="Отправка…"
          onPress={() => void send()}
          testID="session-send"
        />
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: { color: colors.destructive, fontSize: typography.caption },
});
