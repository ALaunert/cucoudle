import { useRef } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import type { StyledLine, StyledRun } from "@cucoudle/protocol";
import type { RenderBuffer } from "../../state/renderBuffer";
import { colors, radii, spacing, typography } from "../../ui/theme";
import { TERMINAL_BACKGROUND, TERMINAL_DEFAULT_FG, ansiColor } from "./ansiPalette";
import { isNearTerminalEnd } from "./PlainTerminal";

type StyledTerminalProps = {
  buffer: RenderBuffer;
};

type Row = { key: string; line: StyledLine };

export function terminalRows(buffer: RenderBuffer): Row[] {
  // Trailing blank screen lines are dead space below the cursor; drop them so
  // the transcript hugs the composer like a real terminal tail.
  let lastUsed = buffer.screen.length - 1;
  while (lastUsed >= 0 && buffer.screen[lastUsed].length === 0) lastUsed -= 1;
  return [
    ...buffer.history.map((line, i) => ({ key: `h${i}`, line })),
    ...buffer.screen.slice(0, lastUsed + 1).map((line, i) => ({ key: `s${i}`, line })),
  ];
}

function runStyle(run: StyledRun): TextStyle {
  const style: TextStyle = { color: ansiColor(run.fg, TERMINAL_DEFAULT_FG) };
  const bg = ansiColor(run.bg);
  if (bg) style.backgroundColor = bg;
  if (run.b) style.fontWeight = "700";
  if (run.i) style.fontStyle = "italic";
  if (run.u) style.textDecorationLine = "underline";
  if (run.d) style.opacity = 0.6;
  return style;
}

function TerminalRow({ line }: { line: StyledLine }) {
  return (
    <Text selectable style={styles.line}>
      {line.length === 0
        ? " "
        : line.map((run, i) => (
            <Text key={i} style={runStyle(run)}>
              {run.t}
            </Text>
          ))}
    </Text>
  );
}

export function StyledTerminal({ buffer }: StyledTerminalProps) {
  const listRef = useRef<FlatList<Row>>(null);
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
    if (followsOutput.current) listRef.current?.scrollToEnd({ animated: false });
  }

  return (
    <FlatList
      accessibilityLabel="Вывод терминала"
      data={terminalRows(buffer)}
      onContentSizeChange={handleContentSizeChange}
      onScroll={handleScroll}
      ref={listRef}
      renderItem={({ item }) => <TerminalRow line={item.line} />}
      scrollEventThrottle={100}
      style={styles.terminal}
      contentContainerStyle={styles.content}
      testID="styled-terminal"
    />
  );
}

const styles = StyleSheet.create({
  terminal: {
    flex: 1,
    minHeight: 0,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: TERMINAL_BACKGROUND,
  },
  content: {
    padding: spacing.md,
  },
  line: {
    color: TERMINAL_DEFAULT_FG,
    fontFamily: "monospace",
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
