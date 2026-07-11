import {
  MAX_RENDER_HISTORY,
  applyRenderFrame,
  createRenderBuffer,
  hasRenderContent,
  replaceRenderSnapshot,
} from "../renderBuffer";

const line = (text: string) => [{ t: text }];

describe("renderBuffer", () => {
  it("applies a frame: appends history and replaces screen", () => {
    const first = applyRenderFrame(createRenderBuffer(), {
      seq: 1,
      historyAppend: [line("old")],
      screen: [line("live 1")],
    });
    const second = applyRenderFrame(first, {
      seq: 2,
      historyAppend: [],
      screen: [line("live 2")],
    });
    expect(second.history).toEqual([line("old")]);
    expect(second.screen).toEqual([line("live 2")]);
    expect(second.lastSeq).toBe(2);
  });

  it("ignores stale frames by seq", () => {
    const buffer = applyRenderFrame(createRenderBuffer(), {
      seq: 5,
      historyAppend: [line("a")],
      screen: [line("b")],
    });
    const next = applyRenderFrame(buffer, { seq: 5, historyAppend: [line("dup")], screen: [] });
    expect(next).toBe(buffer);
  });

  it("caps history length", () => {
    const buffer = applyRenderFrame(createRenderBuffer(), {
      seq: 1,
      historyAppend: Array.from({ length: MAX_RENDER_HISTORY + 50 }, (_, i) => line(`l${i}`)),
      screen: [],
    });
    expect(buffer.history).toHaveLength(MAX_RENDER_HISTORY);
    expect(buffer.history[0]).toEqual(line("l50"));
  });

  it("replaces state from a snapshot", () => {
    const buffer = replaceRenderSnapshot({
      history: [line("h")],
      screen: [line("s")],
      lastSeq: 9,
    });
    expect(buffer).toEqual({ history: [line("h")], screen: [line("s")], lastSeq: 9 });
  });

  it("detects content", () => {
    expect(hasRenderContent(undefined)).toBe(false);
    expect(hasRenderContent(createRenderBuffer())).toBe(false);
    expect(hasRenderContent({ history: [], screen: [[], line("x")], lastSeq: 1 })).toBe(true);
  });
});
