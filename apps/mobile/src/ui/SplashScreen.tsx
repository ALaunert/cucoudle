import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";

import { colors, spacing, typography } from "./theme";

const splashArtwork = require("../../assets/splash-icon.png");

export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Image
        accessible={false}
        resizeMode="contain"
        source={splashArtwork}
        style={styles.artwork}
        testID="splash-artwork"
      />
      <Text accessibilityRole="header" style={styles.wordmark}>
        Cucoudle
      </Text>
      <Text style={styles.tagline}>AI CODING AGENTS · ONE CHAT</Text>
      <ActivityIndicator
        accessible
        accessibilityLabel="Загрузка приложения"
        accessibilityRole="progressbar"
        color={colors.primary}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  artwork: {
    width: "100%",
    maxWidth: 360,
    aspectRatio: 1,
  },
  wordmark: {
    color: colors.text,
    fontSize: typography.title,
    fontWeight: "700",
  },
  tagline: {
    color: colors.textMuted,
    fontSize: typography.caption,
    fontWeight: "600",
    letterSpacing: 1.5,
    textAlign: "center",
  },
});
