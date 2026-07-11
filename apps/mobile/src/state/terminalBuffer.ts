export const MAX_TERMINAL_BUFFER_LENGTH = 200_000;

export interface TerminalBuffer {
  text: string;
  lastSeq: number;
}

export interface TerminalChunk {
  seq: number;
  data: string;
}

function trimTerminalText(text: string): string {
  return text.length <= MAX_TERMINAL_BUFFER_LENGTH
    ? text
    : text.slice(-MAX_TERMINAL_BUFFER_LENGTH);
}

export function createTerminalBuffer(): TerminalBuffer {
  return { text: "", lastSeq: 0 };
}

export function appendTerminalOutput(
  buffer: TerminalBuffer,
  chunk: TerminalChunk,
): TerminalBuffer {
  if (chunk.seq <= buffer.lastSeq) {
    return buffer;
  }

  return {
    text: trimTerminalText(buffer.text + chunk.data),
    lastSeq: chunk.seq,
  };
}

export function replaceTerminalSnapshot(
  _buffer: TerminalBuffer,
  text: string,
  lastSeq: number,
): TerminalBuffer {
  return { text: trimTerminalText(text), lastSeq };
}

export function replayTerminalOutput(
  buffer: TerminalBuffer,
  chunks: readonly TerminalChunk[],
): TerminalBuffer {
  return [...chunks]
    .sort((left, right) => left.seq - right.seq)
    .reduce(appendTerminalOutput, buffer);
}
