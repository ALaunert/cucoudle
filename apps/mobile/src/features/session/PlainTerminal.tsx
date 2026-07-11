import { useRef } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { colors, radii, spacing, typography } from "../../ui/theme";

const END_THRESHOLD = 80;

type TerminalGeometry = {
  contentHeight: number;
  viewportHeight: number;
  offsetY: number;
};

export function isNearTerminalEnd({
  contentHeight,
  viewportHeight,
  offsetY,
}: TerminalGeometry): boolean {
  return contentHeight - viewportHeight - offsetY <= END_THRESHOLD;
}

export function plainTerminalText(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u001b(?:\[[0-?]*[ -/]*[@-~]|[@-_])/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

type PlainTerminalProps = {
  text: string;
};

export function PlainTerminal({ text }: PlainTerminalProps) {
  const scrollRef = useRef<ScrollView>(null);
  const followsOutput = useRef(true);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    followsOutput.current = isNearTerminalEnd({
      contentHeight: contentSize.height,
      viewportHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    });
  }

  function handleContentSizeChange() {
    if (followsOutput.current) scrollRef.current?.scrollToEnd({ animated: false });
  }

  const readable = plainTerminalText(text);

  return (
    <ScrollView
      accessibilityLabel="Вывод терминала"
      onContentSizeChange={handleContentSizeChange}
      onScroll={handleScroll}
      ref={scrollRef}
      scrollEventThrottle={100}
      style={styles.terminal}
      testID="plain-terminal"
    >
      <Text selectable style={[styles.text]} testID="plain-terminal-text">
        {readable || "Вывод пока пуст"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  terminal: {
    flex: 1,
    minHeight: 180,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#030912",
    padding: spacing.md,
  },
  text: {
    color: colors.text,
    fontFamily: "monospace",
    fontSize: typography.caption,
    lineHeight: 20,
    paddingBottom: spacing.md,
  },
});
