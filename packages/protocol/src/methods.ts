import { z } from "zod";
import { MobileDeviceSchema, SessionSchema } from "./sessions.js";
import { EventMessageSchema } from "./envelope.js";

export const MOBILE_METHODS = [
  "mobile.pair",
  "mobile.resume",
  "session.list",
  "session.subscribe",
  "session.input",
  "session.interrupt",
  "terminal.resize",
] as const;

export const DESKTOP_METHODS = [
  "desktop.register",
  "desktop.pairing.create",
] as const;

export type MethodName = (typeof MOBILE_METHODS)[number] | (typeof DESKTOP_METHODS)[number];

export const MOBILE_FORWARDED_METHODS = [
  "session.list",
  "session.subscribe",
  "session.input",
  "session.interrupt",
  "terminal.resize",
] as const;

export const QrPayloadSchema = z.object({
  relayUrl: z.string(),
  desktopId: z.string(),
  pairingCode: z.string(),
  expiresAt: z.string(),
});
export type QrPayload = z.infer<typeof QrPayloadSchema>;

export const MobilePairParamsSchema = z.object({
  desktopId: z.string(),
  pairingCode: z.string(),
  mobileDevice: MobileDeviceSchema,
});
export const MobilePairResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  paired: z.literal(true),
  mobileSessionToken: z.string(),
  mobileSessionExpiresAt: z.string(),
});

export const MobileResumeParamsSchema = z.object({
  desktopId: z.string(),
  mobileDeviceId: z.string(),
  mobileSessionToken: z.string(),
});
export const MobileResumeResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  resumed: z.literal(true),
});

export const SessionListResultSchema = z.object({
  sessions: z.array(SessionSchema),
});

export const SessionSubscribeParamsSchema = z.object({
  sessionId: z.string(),
  afterSeq: z.number().optional(),
});
export const SessionSubscribeResultSchema = z.object({
  session: SessionSchema,
  mode: z.enum(["replay", "snapshot", "live"]),
  events: z.array(EventMessageSchema).optional(),
  terminalBuffer: z.string().optional(),
  lastSeq: z.number().optional(),
});

export const SessionInputParamsSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
  inputMode: z.enum(["text", "raw"]),
});

export const SessionInterruptParamsSchema = z.object({
  sessionId: z.string(),
});

export const TerminalResizeParamsSchema = z.object({
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const DesktopRegisterParamsSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  platform: z.string(),
  appVersion: z.string(),
});

export const DesktopPairingCreateParamsSchema = z.object({
  ttlSeconds: z.number(),
});
export const DesktopPairingCreateResultSchema = z.object({
  desktopId: z.string(),
  pairingCode: z.string(),
  expiresAt: z.string(),
  qrPayload: QrPayloadSchema,
});
