import { z } from "zod";

export const MobilePlatformSchema = z.enum(["ios", "android", "unknown"]);
export type MobilePlatform = z.infer<typeof MobilePlatformSchema>;

export const MobileDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: MobilePlatformSchema,
});
export type MobileDevice = z.infer<typeof MobileDeviceSchema>;

export const SessionStatusSchema = z.enum([
  "starting",
  "running",
  "waiting",
  "stopped",
  "error",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AgentKindSchema = z.enum([
  "claude",
  "codex",
  "cursor",
  "shell",
  "unknown",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  agent: AgentKindSchema,
  title: z.string(),
  command: z.string(),
  argv: z.array(z.string()),
  cwd: z.string(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  lastActivityAt: z.string(),
  exitCode: z.number().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const TerminalOutputSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  data: z.string(),
});
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
