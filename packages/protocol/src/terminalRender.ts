import { z } from "zod";

// Server-side rendered terminal state. The desktop daemon feeds raw PTY bytes
// into a terminal emulator and ships styled lines, so clients never have to
// interpret ANSI/cursor sequences themselves.

export const StyledRunSchema = z.object({
  t: z.string(),
  fg: z.string().optional(),
  bg: z.string().optional(),
  b: z.literal(true).optional(),
  i: z.literal(true).optional(),
  u: z.literal(true).optional(),
  d: z.literal(true).optional(),
});
export type StyledRun = z.infer<typeof StyledRunSchema>;

export const StyledLineSchema = z.array(StyledRunSchema);
export type StyledLine = z.infer<typeof StyledLineSchema>;

// history lines are append-only; screen is the live viewport, replaced whole.
export const TerminalRenderDataSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  historyAppend: z.array(StyledLineSchema),
  screen: z.array(StyledLineSchema),
});
export type TerminalRenderData = z.infer<typeof TerminalRenderDataSchema>;

export const TerminalRenderSnapshotSchema = z.object({
  history: z.array(StyledLineSchema),
  screen: z.array(StyledLineSchema),
  lastSeq: z.number(),
});
export type TerminalRenderSnapshot = z.infer<typeof TerminalRenderSnapshotSchema>;
