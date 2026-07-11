import { z } from "zod";
import { SessionSchema, MobileDeviceSchema, TerminalOutputSchema } from "./sessions.js";

export const DESKTOP_EVENTS = [
  "session.created",
  "session.updated",
  "session.removed",
  "terminal.output",
  "interaction.requested",
  "interaction.updated",
  "interaction.resolved",
  "session.ended",
] as const;
export type DesktopEventName = (typeof DESKTOP_EVENTS)[number];

export const RELAY_EVENTS = ["mobile.paired", "mobile.disconnected"] as const;
export type RelayEventName = (typeof RELAY_EVENTS)[number];

export const SessionCreatedDataSchema = z.object({ session: SessionSchema });
export const SessionUpdatedDataSchema = z.object({ session: SessionSchema });
export const SessionRemovedDataSchema = z.object({ sessionId: z.string() });
export const SessionEndedDataSchema = z.object({
  sessionId: z.string(),
  exitCode: z.number().optional(),
});

export const MobilePairedDataSchema = z.object({
  mobileDevice: MobileDeviceSchema,
  mobileSessionExpiresAt: z.string(),
});
export const MobileDisconnectedDataSchema = z.object({
  mobileDeviceId: z.string(),
});

// --- Structured CLI interactions (approvals, choices, text prompts) ---

export const InteractionKindSchema = z.enum([
  "approval",
  "confirmation",
  "singleSelect",
  "multiSelect",
  "text",
]);
export type InteractionKind = z.infer<typeof InteractionKindSchema>;

export const InteractionOptionIntentSchema = z.enum([
  "approve",
  "approveOnce",
  "approveSession",
  "reject",
  "cancel",
  "neutral",
]);
export type InteractionOptionIntent = z.infer<typeof InteractionOptionIntentSchema>;

export const InteractionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  intent: InteractionOptionIntentSchema,
  shortcut: z.string().optional(),
  disabled: z.boolean().optional(),
});
export type InteractionOption = z.infer<typeof InteractionOptionSchema>;

export const InteractionRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  kind: InteractionKindSchema,
  prompt: z.string(),
  details: z.string().optional(),
  options: z.array(InteractionOptionSchema).optional(),
  allowsText: z.boolean(),
  allowsTerminalInput: z.literal(true),
  sensitive: z.boolean().optional(),
  createdAt: z.string(),
  terminalSeq: z.number().optional(),
});
export type InteractionRequest = z.infer<typeof InteractionRequestSchema>;

export const InteractionRequestedDataSchema = z.object({
  interaction: InteractionRequestSchema,
});
export const InteractionUpdatedDataSchema = z.object({
  interaction: InteractionRequestSchema,
});
export const InteractionResolvedDataSchema = z.object({
  interactionId: z.string(),
  sessionId: z.string(),
  resolution: z.enum(["answered", "cancelled", "superseded", "sessionEnded"]),
  optionIds: z.array(z.string()).optional(),
  resolvedAt: z.string(),
});

export { TerminalOutputSchema };
