import { Tabs } from "expo-router";
import { Text } from "react-native";

import { colors } from "../../ui/theme";

const icons = {
  inbox: "●",
  sessions: "▤",
  new: "+",
  settings: "⚙",
} as const;

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="inbox"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          minHeight: 64,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: route.name === "new" ? 28 : 18 }}>
            {icons[route.name as keyof typeof icons] ?? "•"}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="inbox" options={{ title: "Входящие" }} />
      <Tabs.Screen name="sessions" options={{ title: "Сессии" }} />
      <Tabs.Screen name="new" options={{ title: "Новая" }} />
      <Tabs.Screen name="settings" options={{ title: "Настройки" }} />
    </Tabs>
  );
}
