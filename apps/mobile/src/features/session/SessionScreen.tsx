import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SessionState } from "../../state/sessionState";
import { AppScreen } from "../../ui/components/AppScreen";
import { EmptyState } from "../../ui/components/EmptyState";
import { colors, spacing, typography } from "../../ui/theme";
import { projectLabel } from "../sessions/SessionRow";
import { hasRenderContent } from "../../state/renderBuffer";
import { InterruptButton, type InterruptSession } from "./InterruptButton";
import { PlainTerminal } from "./PlainTerminal";
import { StyledTerminal } from "./StyledTerminal";
import { SessionComposer, type SendSessionInput } from "./SessionComposer";
import type { InteractionRequest } from "@cucoudle/protocol";
import {
  StructuredActionZone,
  type StructuredInteractionResponse,
} from "./StructuredActionZone";

export type SessionConnectionStatus =
  | "online"
  | "reconnecting"
  | "resyncing"
  | "offline"
  | "recovery";

export type SessionScreenProps = {
  sessionId: string;
  state: SessionState;
  connectionStatus: SessionConnectionStatus;
  onSendInput?: SendSessionInput;
  onInterrupt?: InterruptSession;
  actionArea?: ReactNode;
  negotiatedCapabilities?: ReadonlySet<string>;
  structuredInteraction?: InteractionRequest;
  onRespondInteraction?: (params: StructuredInteractionResponse) => Promise<unknown>;
  onOpenSession?: (sessionId: string) => void;
  onBack?: () => void;
};

const connectionLabels: Record<SessionConnectionStatus, string> = {
  online: "Подключено",
  reconnecting: "Переподключение",
  resyncing: "Синхронизация",
  offline: "Офлайн",
  recovery: "Восстанавливаем связь",
};

export function SessionScreen({
  sessionId,
  state,
  connectionStatus,
  onSendInput,
  onInterrupt,
  actionArea,
  negotiatedCapabilities,
  structuredInteraction,
  onRespondInteraction = async () => undefined,
  onOpenSession = () => undefined,
  onBack,
}: SessionScreenProps) {
  const backButton = onBack ? (
    <Pressable
      accessibilityRole="button"
      hitSlop={spacing.sm}
      onPress={onBack}
      style={styles.back}
      testID="session-back"
    >
      <Text style={styles.backLabel}>← Сессии</Text>
    </Pressable>
  ) : null;

  const session = state.sessionsById[sessionId];
  if (!session) {
    return (
      <AppScreen testID="session-screen">
        {backButton}
        <View style={styles.unavailable}>
          <EmptyState
            description="Она завершена, удалена или ещё не загружена."
            title="Сессия недоступна"
          />
        </View>
      </AppScreen>
    );
  }

  const stopped = session.status === "stopped" || session.status === "error";
  const online = connectionStatus === "online";
  const controlsDisabled = stopped || !online;
  const terminal = state.terminalBySessionId[sessionId]?.text ?? "";
  const render = state.renderBySessionId[sessionId];

  return (
    <AppScreen contentStyle={styles.screen} testID="session-screen">
      {backButton}
      <View style={styles.header}>
        <View style={styles.headingCopy}>
          <Text style={styles.agent}>{session.agent}</Text>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>
            {session.title}
          </Text>
          <Text numberOfLines={1} style={styles.project}>
            {projectLabel(session.cwd)}
          </Text>
        </View>
        <View style={styles.headerStatus}>
          <Text style={styles.status}>{session.status}</Text>
          <Text style={styles.connection}>{connectionLabels[connectionStatus]}</Text>
        </View>
      </View>

      {hasRenderContent(render) ? (
        <StyledTerminal buffer={render} />
      ) : (
        <PlainTerminal text={terminal} />
      )}

      {stopped ? (
        <Text accessibilityLiveRegion="polite" style={styles.stopped}>
          {session.exitCode === undefined
            ? "Сессия завершена"
            : `Сессия завершена (код ${session.exitCode})`}
        </Text>
      ) : null}

      <View style={styles.actionArea} testID="session-action-area">
        {actionArea ?? (structuredInteraction ? (
          <StructuredActionZone
            canMutate={connectionStatus === "online"}
            interaction={structuredInteraction}
            negotiatedCapabilities={negotiatedCapabilities}
            onOpenSession={onOpenSession}
            onRespond={onRespondInteraction}
            sessionId={sessionId}
          />
        ) : null)}
      </View>

      <View style={styles.controls}>
        {onInterrupt ? (
          <InterruptButton
            disabled={controlsDisabled}
            onInterrupt={onInterrupt}
            sessionId={sessionId}
          />
        ) : (
          <InterruptButton
            disabled
            onInterrupt={async () => undefined}
            sessionId={sessionId}
          />
        )}
        {onSendInput ? (
          <SessionComposer
            disabled={controlsDisabled}
            onSendInput={onSendInput}
            sessionId={sessionId}
          />
        ) : (
          <SessionComposer
            disabled
            onSendInput={async () => ({ accepted: false })}
            sessionId={sessionId}
          />
        )}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  back: { alignSelf: "flex-start" },
  backLabel: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: "800",
  },
  unavailable: { flex: 1, justifyContent: "center" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headingCopy: { flex: 1, gap: spacing.xs },
  agent: {
    color: colors.primary,
    fontSize: typography.caption,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: "800" },
  project: { color: colors.textMuted, fontSize: typography.caption },
  headerStatus: { alignItems: "flex-end", gap: spacing.xs },
  status: { color: colors.activity, fontSize: typography.caption, fontWeight: "800" },
  connection: { color: colors.textMuted, fontSize: typography.caption },
  stopped: { color: colors.textMuted, fontSize: typography.caption },
  actionArea: { minHeight: 0 },
  controls: { gap: spacing.sm },
});
