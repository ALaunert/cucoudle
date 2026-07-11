import { Stack } from "expo-router";

import { AppProvider } from "../application/AppProvider";
import { colors } from "../ui/theme";

export const rootStackScreenOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.background },
} as const;

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={rootStackScreenOptions} />
    </AppProvider>
  );
}
