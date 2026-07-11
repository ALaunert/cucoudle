import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BrandMark } from "@/ui/BrandMark";
import { colors, spacing } from "../ui/theme";

export default function IndexRoute() {
  return (
    <View style={styles.container}>
      <BrandMark />
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    backgroundColor: colors.background,
  },
});
