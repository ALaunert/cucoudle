import type { InteractionRequest, Session } from "@cucoudle/protocol";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { makeDismissalKey } from "../../state/inboxSelectors";
import { AppButton } from "../../ui/components/AppButton";
import { colors, radii, spacing, typography } from "../../ui/theme";
import {
  StructuredActionZone,
  type StructuredInteractionResponse,
} from "../session/StructuredActionZone";

type AttentionCardProps = {
  session: Session;
  onOpen: (sessionId: string) => void;
  onView: (sessionId: string) => void;
  onDismiss: (attentionKey: string) => void;
  negotiatedCapabilities?: ReadonlySet<string>;
  interaction?: InteractionRequest;
  onRespond?: (params: StructuredInteractionResponse) => Promise<unknown>;
  canMutate?: boolean;
};

const cardContent = {
  waiting: {
    eyebrow: "Нужен ответ",
    message: "Агент ждёт вашего ответа",
    action: "Открыть сессию",
  },
  error: {
    eyebrow: "Ошибка",
    message: "Сессия завершилась с ошибкой",
    action: "Посмотреть терминал",
  },
  stopped: {
    eyebrow: "Завершено",
    message: "Сессия завершена",
    action: "Посмотреть результат",
  },
} as const;

export function AttentionCard({
  session,
  onOpen,
  onView,
  onDismiss,
  negotiatedCapabilities,
  interaction,
  onRespond = async () => undefined,
  canMutate = false,
}: AttentionCardProps) {
  if (
    session.status !== "waiting" &&
    session.status !== "error" &&
    session.status !== "stopped"
  ) {
    return null;
  }

  const content = cardContent[session.status];
  const handlePrimaryAction = () => {
    if (session.status === "waiting") {
      onOpen(session.id);
      return;
    }
    onView(session.id);
  };

  return (
    <View
      accessibilityLabel={`${content.message}. ${session.title}`}
      style={styles.card}
      testID={`attention-card-${session.id}`}
    >
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{content.eyebrow}</Text>
          <Text style={styles.message}>{content.message}</Text>
          <Text numberOfLines={2} style={styles.title}>
            {session.title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Скрыть уведомление"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onDismiss(makeDismissalKey(session))}
          style={({ pressed }) => [styles.dismiss, pressed && styles.dismissPressed]}
        >
          <Text style={styles.dismissText}>Скрыть</Text>
        </Pressable>
      </View>
      {session.status === "waiting" ? (
        <StructuredActionZone
          canMutate={canMutate}
          interaction={interaction}
          negotiatedCapabilities={negotiatedCapabilities}
          onOpenSession={onOpen}
          onRespond={onRespond}
          sessionId={session.id}
        />
      ) : (
        <AppButton label={content.action} onPress={handlePrimaryAction} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.attentionBorder,
    backgroundColor: colors.attentionSurface,
    padding: spacing.md,
    gap: spacing.md,
  },
  heading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  copy: { flex: 1, gap: spacing.xs },
  eyebrow: {
    color: colors.attentionText,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  message: {
    color: colors.text,
    fontSize: typography.body,
    lineHeight: 23,
    fontWeight: "700",
  },
  title: { color: colors.textMuted, fontSize: typography.caption, lineHeight: 19 },
  dismiss: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.small,
  },
  dismissPressed: { backgroundColor: colors.surfaceRaised },
  dismissText: { color: colors.attentionText, fontSize: typography.caption },
});
