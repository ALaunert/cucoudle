import type { RenderBuffer } from "../../../state/renderBuffer";
import {
  exactTerminalRows,
  terminalGridWidth,
  terminalRows,
} from "../terminalPresentation";

function buffer(screen: RenderBuffer["screen"]): RenderBuffer {
  return { history: [], screen, lastSeq: 1 };
}

describe("terminal presentation", () => {
  it("normalizes invisible characters and positional gaps while preserving style", () => {
    const rows = terminalRows(buffer([[
      { t: "        Claude", fg: "green" },
      { t: "          Code", fg: "green", b: true },
      { t: "\u00a0\u200b" },
    ]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      key: "s0",
      kind: "text",
      line: [
        { t: "    Claude", fg: "green" },
        { t: " Code", fg: "green", b: true },
      ],
    });
  });

  it("presents long terminal rules as dividers", () => {
    const rows = terminalRows(buffer([[{ t: "────────────────────────" }]]));
    expect(rows[0]?.kind).toBe("rule");
  });

  it("collapses repeated blank rows and drops trailing screen space", () => {
    const rows = terminalRows(buffer([
      [{ t: "first" }],
      [],
      [],
      [{ t: "second" }],
      [],
      [],
    ]));
    expect(rows.map((row) => row.kind)).toEqual(["text", "blank", "text"]);
    expect(rows.map((row) => row.key)).toEqual(["s0", "s1", "s3"]);
  });

  it("merges adjacent runs with the same style", () => {
    const rows = terminalRows(buffer([[
      { t: "hello", fg: "cyan" },
      { t: " world", fg: "cyan" },
    ]]));
    expect(rows[0]?.line).toEqual([{ t: "hello world", fg: "cyan" }]);
  });

  it("keeps exact spacing available in the 1:1 representation", () => {
    const rows = exactTerminalRows(buffer([[
      { t: "        left" },
      { t: "          right", fg: "cyan" },
    ]]));
    expect(rows[0]?.line).toEqual([
      { t: "        left" },
      { t: "          right", fg: "cyan" },
    ]);
    expect(terminalGridWidth(rows)).toBeGreaterThanOrEqual(720);
  });
});
