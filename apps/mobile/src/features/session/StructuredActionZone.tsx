import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { InteractionRequest, InteractionResponse } from "@cucoudle/protocol";
import { AppButton } from "../../ui/components/AppButton";
import { colors, spacing, typography } from "../../ui/theme";

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

const approveIntents = new Set(["approve", "approveOnce", "approveSession"]);
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
  const pendingRef = useRef(false);

  useEffect(() => {
    pendingRef.current = false;
    setPhase("idle");
    setError(undefined);
  }, [interaction]);

  const structured = negotiatedCapabilities?.has("interaction.structured") === true;
  const approveOption = interaction?.options?.find((option) =>
    approveIntents.has(option.intent),
  );
  const rejectOption = interaction?.options?.find((option) =>
    rejectIntents.has(option.intent),
  );
  const canRespond =
    structured &&
    interaction?.kind === "approval" &&
    interaction.sessionId === sessionId &&
    approveOption !== undefined &&
    rejectOption !== undefined;

  if (!canRespond) {
    return (
      <AppButton label="Открыть сессию" onPress={() => onOpenSession(sessionId)} />
    );
  }

  const disabled = !canMutate || phase !== "idle";

  async function respond(optionId: string) {
    if (!interaction || pendingRef.current || disabled) return;
    pendingRef.current = true;
    setPhase("submitting");
    setError(undefined);
    try {
      await onRespond({
        sessionId,
        interactionId: interaction.id,
        response: { type: "options", optionIds: [optionId] },
      });
      setPhase("submitted");
    } catch (caught) {
      setPhase("failed");
      setError(caught instanceof Error ? caught.message : "Не удалось отправить ответ");
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.actions}>
        <View style={styles.action}>
          <AppButton
            disabled={disabled}
            label="Отклонить"
            onPress={() => void respond(rejectOption.id)}
            variant="secondary"
          />
        </View>
        <View style={styles.action}>
          <AppButton
            disabled={disabled}
            label="Разрешить"
            loading={phase === "submitting"}
            loadingLabel="Отправка…"
            onPress={() => void respond(approveOption.id)}
          />
        </View>
      </View>
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
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm },
  action: { flex: 1 },
  note: { color: colors.textMuted, fontSize: typography.caption },
  error: { color: colors.destructive, fontSize: typography.caption },
});
