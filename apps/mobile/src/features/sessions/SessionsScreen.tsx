import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import {
  selectSessions,
  type SessionFilter as SessionFilterValue,
} from "../../state/inboxSelectors";
import type { SessionState } from "../../state/sessionState";
import { AppScreen } from "../../ui/components/AppScreen";
import { EmptyState } from "../../ui/components/EmptyState";
import { colors, spacing, typography } from "../../ui/theme";
import { SessionFilter } from "./SessionFilter";
import { SessionRow } from "./SessionRow";

export type SessionsConnectionStatus = "online" | "reconnecting" | "offline";

export type SessionsScreenProps = {
  state: SessionState;
  connectionStatus: SessionsConnectionStatus;
  hasLoadedSessionList: boolean;
  onOpenSession(sessionId: string): void;
};

const emptyContent = {
  noSessions: {
    title: "Сессий пока нет",
    description: "Запустите CLI-агента на подключённом компьютере.",
  },
  reconnecting: {
    title: "Переподключаемся",
    description: "Список сессий появится после восстановления соединения.",
  },
  offline: {
    title: "Компьютер офлайн",
    description: "Подключите компьютер к сети, чтобы увидеть сессии.",
  },
  loading: {
    title: "Загружаем сессии",
    description: "Ждём список сессий от подключённого компьютера.",
  },
  filtered: {
    title: "Нет подходящих сессий",
    description: "Выберите другой фильтр.",
  },
} as const;

export function SessionsScreen({
  state,
  connectionStatus,
  hasLoadedSessionList,
  onOpenSession,
}: SessionsScreenProps) {
  const [filter, setFilter] = useState<SessionFilterValue>("all");
  const sessions = selectSessions(state, filter);
  const allSessions = selectSessions(state, "all");

  let empty: { title: string; description: string } = emptyContent.noSessions;
  if (connectionStatus === "offline") empty = emptyContent.offline;
  else if (connectionStatus === "reconnecting") empty = emptyContent.reconnecting;
  else if (!hasLoadedSessionList) empty = emptyContent.loading;
  else if (allSessions.length > 0) empty = emptyContent.filtered;

  return (
    <AppScreen testID="sessions-screen">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>
          Сессии
        </Text>
        <Text style={styles.count}>{allSessions.length}</Text>
      </View>
      <SessionFilter onChange={setFilter} value={filter} />
      <FlatList
        contentContainerStyle={[
          styles.list,
          sessions.length === 0 && styles.emptyList,
        ]}
        data={sessions}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(session) => session.id}
        ListEmptyComponent={
          <EmptyState description={empty.description} title={empty.title} />
        }
        renderItem={({ item }) => (
          <SessionRow
            onPress={() => onOpenSession(item.id)}
            session={item}
          />
        )}
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  title: { color: colors.text, fontSize: typography.title, fontWeight: "800" },
  count: {
    color: colors.primaryText,
    backgroundColor: colors.primary,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    fontSize: typography.caption,
    fontWeight: "800",
  },
  list: { paddingTop: spacing.md, paddingBottom: spacing.xl },
  emptyList: { flexGrow: 1, justifyContent: "center" },
  separator: { height: spacing.sm },
});
