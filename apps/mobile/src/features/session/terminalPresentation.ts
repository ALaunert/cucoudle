import type { StyledLine, StyledRun } from "@cucoudle/protocol";
import type { RenderBuffer } from "../../state/renderBuffer";

const MAX_READING_INDENT = 4;
const POSITIONAL_GAP = 4;
const RULE_PATTERN = /^[─━═╌╍┄┅—_=-]{6,}$/u;
const INVISIBLE_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200d\u2060\ufeff]/gu;

type RunStyle = Omit<StyledRun, "t">;
type Cell = { value: string; style: RunStyle };

export type PresentedTerminalRow = {
  key: string;
  kind: "text" | "blank" | "rule";
  line: StyledLine;
};

const lineCache = new WeakMap<StyledLine, Omit<PresentedTerminalRow, "key">>();

function runStyle(run: StyledRun): RunStyle {
  const { t: _text, ...style } = run;
  return style;
}

function sameStyle(left: RunStyle, right: RunStyle): boolean {
  return left.fg === right.fg
    && left.bg === right.bg
    && left.b === right.b
    && left.i === right.i
    && left.u === right.u
    && left.d === right.d;
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/gu, " ")
    .replace(/\t/gu, "  ")
    .replace(INVISIBLE_PATTERN, "");
}

function lineCells(line: StyledLine): Cell[] {
  return line.flatMap((run) => {
    const style = runStyle(run);
    return Array.from(cleanText(run.t), (value) => ({ value, style }));
  });
}

function compactCells(cells: Cell[]): Cell[] {
  while (cells.at(-1)?.value === " ") cells.pop();

  let leading = 0;
  while (cells[leading]?.value === " ") leading += 1;
  if (leading > MAX_READING_INDENT) {
    cells.splice(0, leading - MAX_READING_INDENT);
  }

  const compacted: Cell[] = [];
  for (let index = 0; index < cells.length;) {
    if (cells[index]?.value !== " ") {
      compacted.push(cells[index]!);
      index += 1;
      continue;
    }
    let end = index;
    while (cells[end]?.value === " ") end += 1;
    const length = end - index;
    const positional = index > 0 && end < cells.length && length >= POSITIONAL_GAP;
    if (positional) compacted.push(cells[index]!);
    else compacted.push(...cells.slice(index, end));
    index = end;
  }
  return compacted;
}

function cellsToRuns(cells: Cell[]): StyledLine {
  const runs: StyledLine = [];
  for (const cell of cells) {
    const previous = runs.at(-1);
    if (previous && sameStyle(runStyle(previous), cell.style)) {
      previous.t += cell.value;
    } else {
      runs.push({ t: cell.value, ...cell.style });
    }
  }
  return runs;
}

function presentLine(line: StyledLine): Omit<PresentedTerminalRow, "key"> {
  const cached = lineCache.get(line);
  if (cached) return cached;

  const normalized = cellsToRuns(compactCells(lineCells(line)));
  const plain = normalized.map((run) => run.t).join("").trim();
  const presented: Omit<PresentedTerminalRow, "key"> = plain.length === 0
    ? { kind: "blank", line: [] }
    : RULE_PATTERN.test(plain)
      ? { kind: "rule", line: normalized }
      : { kind: "text", line: normalized };
  lineCache.set(line, presented);
  return presented;
}

export function terminalRows(buffer: RenderBuffer): PresentedTerminalRow[] {
  let lastUsed = buffer.screen.length - 1;
  while (lastUsed >= 0 && buffer.screen[lastUsed]?.length === 0) lastUsed -= 1;

  const source = [
    ...buffer.history.map((line, index) => ({ key: `h${index}`, line })),
    ...buffer.screen.slice(0, lastUsed + 1).map((line, index) => ({ key: `s${index}`, line })),
  ];
  const rows: PresentedTerminalRow[] = [];
  for (const item of source) {
    const row = { key: item.key, ...presentLine(item.line) };
    if (row.kind === "blank" && rows.at(-1)?.kind === "blank") continue;
    rows.push(row);
  }
  return rows;
}

export function exactTerminalRows(buffer: RenderBuffer): PresentedTerminalRow[] {
  let lastUsed = buffer.screen.length - 1;
  while (lastUsed >= 0 && buffer.screen[lastUsed]?.length === 0) lastUsed -= 1;
  return [
    ...buffer.history.map((line, index) => ({
      key: `h${index}`,
      kind: line.length === 0 ? "blank" as const : "text" as const,
      line,
    })),
    ...buffer.screen.slice(0, lastUsed + 1).map((line, index) => ({
      key: `s${index}`,
      kind: line.length === 0 ? "blank" as const : "text" as const,
      line,
    })),
  ];
}

export function terminalGridWidth(rows: PresentedTerminalRow[]): number {
  const columns = rows.reduce((maximum, row) => {
    const width = row.line.reduce((total, run) => total + Array.from(run.t).length, 0);
    return Math.max(maximum, width);
  }, 0);
  return Math.max(720, columns * 8 + 2 * 16);
}
