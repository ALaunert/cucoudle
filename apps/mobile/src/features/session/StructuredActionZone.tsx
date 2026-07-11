import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";

import type { InteractionRequest, InteractionResponse } from "@cucoudle/protocol";
import { AppButton } from "../../ui/components/AppButton";
import { colors, radii, spacing, typography } from "../../ui/theme";

export type StructuredInteractionResponse = {
  sessionId: string;
  interactionId: string;
  response: InteractionResponse;
};

type StructuredActionZoneProps = {
  sessionId: string;
  canMutate: boolean;
  negotiatedCapabilities?: ReadonlySet<string>;
  interaction?: InteractionRequest;
  onOpenSession(sessionId: string): void;
  onRespond(params: StructuredInteractionResponse): Promise<unknown>;
};

const approveIntents = new Set(["approve", "approveOnce"]);
const rejectIntents = new Set(["reject", "cancel"]);

export function StructuredActionZone({
  sessionId,
  canMutate,
  negotiatedCapabilities,
  interaction,
  onOpenSession,
  onRespond,
}: StructuredActionZoneProps) {
  const [phase, setPhase] = useState<"idle" | "submitting" | "submitted" | "failed">("idle");
  const [error, setError] = useState<string>();
  const [text, setText] = useState("");
  const pendingRef = useRef(false);

  useEffect(() => {
    pendingRef.current = false;
    setPhase("idle");
    setError(undefined);
    setText("");
  }, [interaction]);

  const structured = negotiatedCapabilities?.has("interaction.structured") === true;
  const active =
    structured && interaction !== undefined && interaction.sessionId === sessionId;
  const disabled = !canMutate || phase !== "idle";

  async function submit(response: InteractionResponse) {
    if (!interaction || pendingRef.current || disabled) return;
    pendingRef.current = true;
    setPhase("submitting");
    setError(undefined);
    try {
      await onRespond({ sessionId, interactionId: interaction.id, response });
      setPhase("submitted");
    } catch (caught) {
      setPhase("failed");
      setError(caught instanceof Error ? caught.message : "Не удалось отправить ответ");
    }
  }

  const respondWithOption = (optionId: string) =>
    void submit({ type: "options", optionIds: [optionId] });

  const content = active && interaction ? renderKind(interaction) : null;

  if (!content) {
    return (
      <AppButton label="Открыть сессию" onPress={() => onOpenSession(sessionId)} />
    );
  }

  return (
    <View style={styles.container}>
      {content}
      {phase === "submitted" ? (
        <Text accessibilityLiveRegion="polite" style={styles.note}>
          Ответ отправлен, ждём подтверждения
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );

  function renderKind(request: InteractionRequest) {
    switch (request.kind) {
      case "approval":
      case "confirmation": {
        const approveOption = request.options?.find((option) =>
          approveIntents.has(option.intent),
        );
        const rejectOption = request.options?.find((option) =>
          rejectIntents.has(option.intent),
        );
        const alwaysOption = request.options?.find(
          (option) => option.intent === "approveSession",
        );
        if (!approveOption || !rejectOption) return null;
        return (
          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton
                disabled={disabled}
                label="Отклонить"
                onPress={() => respondWithOption(rejectOption.id)}
                variant="secondary"
              />
            </View>
            {alwaysOption ? (
              <View style={styles.action}>
                <AppButton
                  disabled={disabled}
                  label="Всегда"
                  onPress={() => respondWithOption(alwaysOption.id)}
                  variant="secondary"
                />
              </View>
            ) : null}
            <View style={styles.action}>
              <AppButton
                disabled={disabled}
                label="Разрешить"
                loading={phase === "submitting"}
                loadingLabel="Отправка…"
                onPress={() => respondWithOption(approveOption.id)}
              />
            </View>
          </View>
        );
      }
      case "singleSelect": {
        const options = request.options ?? [];
        if (options.length === 0) return null;
        return (
          <View style={styles.choices}>
            {options.map((option) => (
              <AppButton
                disabled={disabled}
                key={option.id}
                label={option.label}
                onPress={() => respondWithOption(option.id)}
              />
            ))}
          </View>
        );
      }
      case "text":
        return (
          <View style={styles.row}>
            <TextInput
              accessibilityLabel="Ответ"
              editable={!disabled}
              multiline
              onChangeText={setText}
              placeholder="Введите ответ"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={text}
            />
            <AppButton
              disabled={disabled || text.length === 0}
              label="Отправить"
              loading={phase === "submitting"}
              loadingLabel="Отправка…"
              onPress={() => void submit({ type: "text", text, submit: true })}
            />
          </View>
        );
      default:
        return null;
    }
  }
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  choices: { gap: spacing.sm },
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
  note: { color: colors.textMuted, fontSize: typography.caption },
  error: { color: colors.destructive, fontSize: typography.caption },
});
