import type { InteractionRequest, Session } from "@cucoudle/protocol";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { selectAttentionCards, selectRecentActivity } from "../../state/inboxSelectors";
import type { ActivityFact, SessionState } from "../../state/sessionState";
import { AppScreen } from "../../ui/components/AppScreen";
import {
  ConnectionBanner,
  type ConnectionStatus,
} from "../../ui/components/ConnectionBanner";
import { EmptyState } from "../../ui/components/EmptyState";
import { colors, spacing, typography } from "../../ui/theme";
import { ActivityRow } from "./ActivityRow";
import { AttentionCard } from "./AttentionCard";
import type { StructuredInteractionResponse } from "../session/StructuredActionZone";

export type InboxConnectionStatus = "connected" | ConnectionStatus;

type InboxScreenProps = {
  state?: SessionState;
  attentionCards?: Session[];
  recentActivity?: ActivityFact[];
  connectionStatus: InboxConnectionStatus;
  onOpenSession: (sessionId: string) => void;
  onViewSession: (sessionId: string) => void;
  onDismissAttention: (attentionKey: string) => void;
  negotiatedCapabilities?: ReadonlySet<string>;
  activeInteractions?: Record<string, InteractionRequest>;
  onRespondInteraction?: (params: StructuredInteractionResponse) => Promise<unknown>;
  canMutate?: boolean;
};

function attentionCountLabel(count: number): string {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} требует внимания`;
  return `${count} требуют внимания`;
}

export function InboxScreen({
  state,
  attentionCards,
  recentActivity,
  connectionStatus,
  onOpenSession,
  onViewSession,
  onDismissAttention,
  negotiatedCapabilities,
  activeInteractions,
  onRespondInteraction,
  canMutate = false,
}: InboxScreenProps) {
  const attention = attentionCards ?? (state ? selectAttentionCards(state) : []);
  const activity = recentActivity ?? (state ? selectRecentActivity(state) : []);
  const hasContent = attention.length > 0 || activity.length > 0;
  const isWaitingForData = connectionStatus === "reconnecting" && !hasContent;

  return (
    <AppScreen testID="inbox-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        testID="inbox-content"
      >
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.screenTitle}>
            Входящие
          </Text>
          <Text accessibilityLiveRegion="polite" style={styles.count}>
            {attentionCountLabel(attention.length)}
          </Text>
        </View>

        {connectionStatus !== "connected" ? (
          <ConnectionBanner status={connectionStatus} />
        ) : null}
        {connectionStatus === "offline" && hasContent ? (
          <Text accessibilityRole="alert" style={styles.staleCopy}>
            Показаны сохранённые данные
          </Text>
        ) : null}

        {isWaitingForData ? (
          <EmptyState
            description="Список обновится после восстановления соединения."
            title="Ждём актуальные данные"
          />
        ) : null}

        {attention.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Требуют внимания
            </Text>
            {attention.map((item) => (
              <AttentionCard
                canMutate={canMutate}
                key={`${item.id}:${item.status}:${item.lastActivityAt}:${item.exitCode ?? ""}`}
                onDismiss={onDismissAttention}
                interaction={activeInteractions?.[item.id]}
                negotiatedCapabilities={negotiatedCapabilities}
                onOpen={onOpenSession}
                onRespond={onRespondInteraction}
                onView={onViewSession}
                session={item}
              />
            ))}
          </View>
        ) : null}

        {activity.length > 0 ? (
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Последняя активность
            </Text>
            {activity.map((item) => (
              <ActivityRow activity={item} key={item.id} />
            ))}
          </View>
        ) : null}

        {connectionStatus === "connected" && !hasContent ? (
          <EmptyState
            description="Здесь появятся события, требующие внимания."
            title="Входящих пока нет"
          />
        ) : null}
      </ScrollView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { gap: spacing.xs },
  screenTitle: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "800",
  },
  count: { color: colors.textMuted, fontSize: typography.body },
  staleCopy: { color: colors.attentionText, fontSize: typography.caption },
  section: { gap: spacing.md },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
  },
});
