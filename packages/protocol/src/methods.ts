import { z } from "zod";
import { MobileDeviceSchema, SessionSchema } from "./sessions";
import { EventMessageSchema } from "./envelope";
import { InteractionRequestSchema } from "./events";
import { TerminalRenderSnapshotSchema } from "./terminalRender";

export const MOBILE_METHODS = [
  "mobile.pair",
  "mobile.resume",
  "session.list",
  "session.subscribe",
  "session.input",
  "session.interrupt",
  "terminal.resize",
  "interaction.respond",
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
  "interaction.respond",
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
  offeredCapabilities: z.array(z.string()).optional(),
});
export const MobilePairResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  paired: z.literal(true),
  mobileSessionToken: z.string(),
  mobileSessionExpiresAt: z.string(),
  negotiatedCapabilities: z.array(z.string()).optional(),
});

export const MobileResumeParamsSchema = z.object({
  desktopId: z.string(),
  mobileDeviceId: z.string(),
  mobileSessionToken: z.string(),
  offeredCapabilities: z.array(z.string()).optional(),
});
export const MobileResumeResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  resumed: z.literal(true),
  negotiatedCapabilities: z.array(z.string()).optional(),
});

export const SessionListResultSchema = z.object({
  sessions: z.array(SessionSchema),
  negotiatedCapabilities: z.array(z.string()).optional(),
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
  activeInteraction: InteractionRequestSchema.optional(),
  terminalRender: TerminalRenderSnapshotSchema.optional(),
  negotiatedCapabilities: z.array(z.string()).optional(),
});

// session.input has four additive PTY-write modes. text/raw stay
// backward-compatible; bytes/keys give full terminal parity from the phone.
export const TerminalModifierSchema = z.enum(["ctrl", "alt", "shift", "meta"]);
export type TerminalModifier = z.infer<typeof TerminalModifierSchema>;

export const TerminalKeyNameSchema = z.enum([
  "enter", "escape", "tab", "backspace", "delete", "insert",
  "arrowUp", "arrowDown", "arrowLeft", "arrowRight",
  "home", "end", "pageUp", "pageDown", "space",
  "f1", "f2", "f3", "f4", "f5", "f6",
  "f7", "f8", "f9", "f10", "f11", "f12",
]);
export type TerminalKeyName = z.infer<typeof TerminalKeyNameSchema>;

export const TerminalKeyStrokeSchema = z.object({
  key: z.union([TerminalKeyNameSchema, z.object({ character: z.string() })]),
  modifiers: z.array(TerminalModifierSchema).optional(),
});
export type TerminalKeyStroke = z.infer<typeof TerminalKeyStrokeSchema>;

export const SessionInputParamsSchema = z.discriminatedUnion("inputMode", [
  z.object({ sessionId: z.string(), inputMode: z.literal("text"), data: z.string(), submit: z.boolean().optional() }),
  z.object({ sessionId: z.string(), inputMode: z.literal("raw"), data: z.string() }),
  z.object({ sessionId: z.string(), inputMode: z.literal("bytes"), dataBase64: z.string() }),
  z.object({ sessionId: z.string(), inputMode: z.literal("keys"), keys: z.array(TerminalKeyStrokeSchema) }),
]);
export type SessionInputParams = z.infer<typeof SessionInputParamsSchema>;

export const SessionInputResultSchema = z.object({
  accepted: z.boolean(),
  bytesWritten: z.number().optional(),
});

export const SessionInterruptParamsSchema = z.object({
  sessionId: z.string(),
});

// interaction.respond — mobile answers a structured CLI prompt. Relay forwards
// it verbatim; desktop maps the response to the exact PTY input.
export const InteractionResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("options"), optionIds: z.array(z.string()) }),
  z.object({ type: z.literal("text"), text: z.string(), submit: z.boolean().optional() }),
  z.object({ type: z.literal("cancel") }),
]);
export type InteractionResponse = z.infer<typeof InteractionResponseSchema>;

export const InteractionRespondParamsSchema = z.object({
  sessionId: z.string(),
  interactionId: z.string(),
  response: InteractionResponseSchema,
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
  offeredCapabilities: z.array(z.string()).optional(),
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
