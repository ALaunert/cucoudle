import type {
  StyledLine,
  TerminalRenderData,
  TerminalRenderSnapshot,
} from "@cucoudle/protocol";

export const MAX_RENDER_HISTORY = 1000;

export interface RenderBuffer {
  history: StyledLine[];
  screen: StyledLine[];
  lastSeq: number;
}

export function createRenderBuffer(): RenderBuffer {
  return { history: [], screen: [], lastSeq: 0 };
}

export function applyRenderFrame(
  buffer: RenderBuffer,
  frame: Pick<TerminalRenderData, "seq" | "historyAppend" | "screen">,
): RenderBuffer {
  if (frame.seq <= buffer.lastSeq) return buffer;
  const history =
    frame.historyAppend.length === 0
      ? buffer.history
      : [...buffer.history, ...frame.historyAppend].slice(-MAX_RENDER_HISTORY);
  return { history, screen: frame.screen, lastSeq: frame.seq };
}

export function replaceRenderSnapshot(snapshot: TerminalRenderSnapshot): RenderBuffer {
  return {
    history: snapshot.history.slice(-MAX_RENDER_HISTORY),
    screen: snapshot.screen,
    lastSeq: snapshot.lastSeq,
  };
}

export function hasRenderContent(buffer: RenderBuffer | undefined): buffer is RenderBuffer {
  if (!buffer) return false;
  return buffer.history.length > 0 || buffer.screen.some((line) => line.length > 0);
}
