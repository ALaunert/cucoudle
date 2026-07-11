import {
  MAX_TERMINAL_BUFFER_LENGTH,
  appendTerminalOutput,
  createTerminalBuffer,
  replayTerminalOutput,
  replaceTerminalSnapshot,
} from "../terminalBuffer";

describe("terminalBuffer", () => {
  it("appends only increasing sequence numbers", () => {
    const first = appendTerminalOutput(createTerminalBuffer(), { seq: 2, data: "two" });

    expect(appendTerminalOutput(first, { seq: 2, data: "duplicate" })).toBe(first);
    expect(appendTerminalOutput(first, { seq: 1, data: "older" })).toBe(first);
    expect(appendTerminalOutput(first, { seq: 3, data: "three" })).toEqual({
      text: "twothree",
      lastSeq: 3,
    });
  });

  it("retains the last 200,000 UTF-16 code units", () => {
    const oversized = "x".repeat(MAX_TERMINAL_BUFFER_LENGTH + 25);

    const result = appendTerminalOutput(createTerminalBuffer(), { seq: 1, data: oversized });

    expect(result.text).toHaveLength(MAX_TERMINAL_BUFFER_LENGTH);
    expect(result.text).toBe(oversized.slice(-MAX_TERMINAL_BUFFER_LENGTH));
  });

  it("replaces text and sequence from a snapshot", () => {
    const result = replaceTerminalSnapshot(
      { text: "old", lastSeq: 10 },
      "snapshot",
      42,
    );

    expect(result).toEqual({ text: "snapshot", lastSeq: 42 });
  });

  it("orders replay chunks before appending and ignores stale chunks", () => {
    const result = replayTerminalOutput(
      { text: "one", lastSeq: 1 },
      [
        { seq: 4, data: "four" },
        { seq: 2, data: "two" },
        { seq: 3, data: "three" },
        { seq: 2, data: "duplicate" },
      ],
    );

    expect(result).toEqual({ text: "onetwothreefour", lastSeq: 4 });
  });
});
