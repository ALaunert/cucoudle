import { useMemo, useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextStyle,
} from "react-native";

import type { StyledLine, StyledRun } from "@cucoudle/protocol";
import type { RenderBuffer } from "../../state/renderBuffer";
import { colors, radii, spacing, typography } from "../../ui/theme";
import { TERMINAL_BACKGROUND, TERMINAL_DEFAULT_FG, ansiColor } from "./ansiPalette";
import { isNearTerminalEnd } from "./PlainTerminal";
import {
  exactTerminalRows,
  terminalRows,
  terminalGridWidth,
  type PresentedTerminalRow,
} from "./terminalPresentation";

export { terminalRows } from "./terminalPresentation";

type StyledTerminalProps = {
  buffer: RenderBuffer;
};

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

type TerminalMode = "readable" | "grid";

function TerminalRow({ exact = false, row }: { exact?: boolean; row: PresentedTerminalRow }) {
  if (row.kind === "blank") return <View style={styles.blankLine} />;
  if (!exact && row.kind === "rule") {
    return (
      <View accessibilityElementsHidden style={styles.ruleRow}>
        <View style={styles.rule} />
      </View>
    );
  }
  return (
    <Text numberOfLines={exact ? 1 : undefined} selectable style={styles.line}>
      {row.line.map((run, i) => (
        <Text key={i} style={runStyle(run)}>
          {run.t}
        </Text>
      ))}
    </Text>
  );
}

export function StyledTerminal({ buffer }: StyledTerminalProps) {
  const [mode, setMode] = useState<TerminalMode>("readable");
  const readableRows = useMemo(
    () => terminalRows(buffer),
    [buffer.history, buffer.screen],
  );
  const gridRows = useMemo(
    () => exactTerminalRows(buffer),
    [buffer.history, buffer.screen],
  );
  const rows = mode === "readable" ? readableRows : gridRows;
  const gridWidth = useMemo(
    () => mode === "grid" ? terminalGridWidth(gridRows) : 720,
    [gridRows, mode],
  );
  const listRef = useRef<FlatList<PresentedTerminalRow>>(null);
  const followsOutput = useRef(true);
  const [showLiveTail, setShowLiveTail] = useState(false);

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const follows = isNearTerminalEnd({
      contentHeight: contentSize.height,
      viewportHeight: layoutMeasurement.height,
      offsetY: contentOffset.y,
    });
    followsOutput.current = follows;
    setShowLiveTail(!follows);
  }

  function handleContentSizeChange() {
    if (followsOutput.current) listRef.current?.scrollToEnd({ animated: false });
  }

  function scrollToLiveTail() {
    followsOutput.current = true;
    setShowLiveTail(false);
    listRef.current?.scrollToEnd({ animated: true });
  }

  function selectMode(nextMode: TerminalMode) {
    setMode(nextMode);
    followsOutput.current = true;
    setShowLiveTail(false);
  }

  const list = (
    <FlatList
      accessibilityLabel="Вывод терминала"
      contentContainerStyle={styles.content}
      data={rows}
      onContentSizeChange={handleContentSizeChange}
      onScroll={handleScroll}
      ref={listRef}
      renderItem={({ item }) => <TerminalRow exact={mode === "grid"} row={item} />}
      nestedScrollEnabled
      scrollEventThrottle={100}
      style={[styles.list, mode === "grid" && { width: gridWidth }]}
      testID="styled-terminal-list"
    />
  );

  return (
    <View style={styles.terminal} testID="styled-terminal">
      <View accessibilityRole="tablist" style={styles.modeControl}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "readable" }}
          onPress={() => selectMode("readable")}
          style={[styles.modeOption, mode === "readable" && styles.modeOptionSelected]}
        >
          <Text style={[styles.modeLabel, mode === "readable" && styles.modeLabelSelected]}>
            Читать
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: mode === "grid" }}
          onPress={() => selectMode("grid")}
          style={[styles.modeOption, mode === "grid" && styles.modeOptionSelected]}
        >
          <Text style={[styles.modeLabel, mode === "grid" && styles.modeLabelSelected]}>
            1:1
          </Text>
        </Pressable>
      </View>
      {mode === "grid" ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={[styles.gridContent, { width: gridWidth }]}
          horizontal
          style={styles.gridScroller}
          testID="terminal-grid-scroll"
        >
          {list}
        </ScrollView>
      ) : list}
      {showLiveTail ? (
        <Pressable
          accessibilityLabel="К последнему выводу"
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={scrollToLiveTail}
          style={({ pressed }) => [styles.liveTail, pressed && styles.liveTailPressed]}
          testID="terminal-live-tail"
        >
          <Text style={styles.liveTailIcon}>↓</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  terminal: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    borderRadius: radii.small,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: TERMINAL_BACKGROUND,
  },
  list: { flex: 1, minHeight: 0 },
  gridScroller: { flex: 1, minHeight: 0 },
  gridContent: { flexGrow: 1 },
  modeControl: {
    zIndex: 1,
    flexDirection: "row",
    alignSelf: "flex-start",
    marginTop: spacing.sm,
    marginLeft: spacing.sm,
    padding: 2,
    borderRadius: 7,
    backgroundColor: colors.surface,
  },
  modeOption: {
    minWidth: 64,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: 5,
  },
  modeOptionSelected: { backgroundColor: colors.secondary },
  modeLabel: { color: colors.textMuted, fontSize: typography.caption },
  modeLabelSelected: { color: colors.text, fontWeight: "700" },
  content: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  line: {
    color: TERMINAL_DEFAULT_FG,
    fontFamily: "monospace",
    fontSize: typography.caption,
    lineHeight: 18,
  },
  blankLine: { height: 9 },
  ruleRow: { height: 18, justifyContent: "center" },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  liveTail: {
    position: "absolute",
    right: spacing.sm,
    bottom: spacing.sm,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  liveTailPressed: { backgroundColor: colors.secondaryPressed },
  liveTailIcon: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: "800",
  },
});
