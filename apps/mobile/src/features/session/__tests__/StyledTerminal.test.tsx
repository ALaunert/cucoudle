import { render } from "@testing-library/react-native";

import { StyledTerminal, terminalRows } from "../StyledTerminal";
import { ansiColor, TERMINAL_DEFAULT_FG } from "../ansiPalette";
import type { RenderBuffer } from "../../../state/renderBuffer";

const buffer: RenderBuffer = {
  history: [[{ t: "scrolled line" }]],
  screen: [
    [{ t: "error", fg: "red", b: true as const }, { t: " plain" }],
    [],
    [],
  ],
  lastSeq: 3,
};

describe("terminalRows", () => {
  it("orders history before screen and drops trailing blank screen lines", () => {
    const rows = terminalRows(buffer);
    expect(rows.map((r) => r.key)).toEqual(["h0", "s0"]);
    expect(rows[0].line[0].t).toBe("scrolled line");
  });

  it("keeps blank lines that sit between content", () => {
    const rows = terminalRows({
      history: [],
      screen: [[{ t: "a" }], [], [{ t: "b" }]],
      lastSeq: 1,
    });
    expect(rows.map((r) => r.key)).toEqual(["s0", "s1", "s2"]);
  });
});

describe("ansiColor", () => {
  it("maps named ansi colors and falls back for unknown values", () => {
    expect(ansiColor("red")).toBe("#F47067");
    expect(ansiColor("brightblue")).toBe("#6CB6FF");
    expect(ansiColor("ff00aa")).toBe("#ff00aa");
    expect(ansiColor("nonsense", TERMINAL_DEFAULT_FG)).toBe(TERMINAL_DEFAULT_FG);
    expect(ansiColor(undefined, TERMINAL_DEFAULT_FG)).toBe(TERMINAL_DEFAULT_FG);
  });
});

describe("StyledTerminal", () => {
  it("renders styled runs with palette colors", () => {
    const view = render(<StyledTerminal buffer={buffer} />);
    const run = view.getByText("error");
    const flat = Object.assign({}, ...[run.props.style].flat(Infinity).filter(Boolean));
    expect(flat.color).toBe("#F47067");
    expect(flat.fontWeight).toBe("700");
    expect(view.getByText(" plain")).toBeTruthy();
    expect(view.getByTestId("styled-terminal").props.style).toEqual(
      expect.objectContaining({ minHeight: 0 }),
    );
  });
});
