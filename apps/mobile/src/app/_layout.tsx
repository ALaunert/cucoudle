import { Stack } from "expo-router";

import { AppProvider } from "../application/AppProvider";

export default function RootLayout() {
  return (
    <AppProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AppProvider>
  );
}
