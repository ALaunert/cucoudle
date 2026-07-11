import type { SessionInputParams } from "@cucoudle/protocol";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  const sendDisabled = controlsDisabled || draft.length === 0;

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
      <View style={styles.field} testID="session-composer-field">
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
        <Pressable
          accessibilityLabel={pending ? "Отправка…" : "Отправить"}
          accessibilityRole="button"
          accessibilityState={{ busy: pending, disabled: sendDisabled }}
          disabled={sendDisabled}
          onPress={() => void send()}
          style={({ pressed }) => [
            styles.send,
            sendDisabled && !pending && styles.sendDisabled,
            pressed && !sendDisabled && styles.sendPressed,
          ]}
          testID="session-send"
        >
          {pending ? (
            <ActivityIndicator color={colors.primaryText} size="small" />
          ) : (
            <Text
              style={[styles.sendIcon, sendDisabled && styles.sendIconDisabled]}
              testID="session-send-icon"
            >
              ↑
            </Text>
          )}
        </Pressable>
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
  field: {
    position: "relative",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  input: {
    minHeight: 52,
    maxHeight: 120,
    color: colors.text,
    fontSize: typography.body,
    paddingHorizontal: spacing.md,
    paddingRight: spacing.xxl + spacing.md,
    paddingVertical: spacing.sm,
  },
  send: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  sendPressed: { backgroundColor: colors.primaryPressed },
  sendDisabled: { backgroundColor: colors.disabled },
  sendIcon: {
    color: colors.primaryText,
    fontSize: 24,
    fontWeight: "800",
    lineHeight: 26,
  },
  sendIconDisabled: { color: colors.disabledText },
  error: { color: colors.destructive, fontSize: typography.caption },
});
