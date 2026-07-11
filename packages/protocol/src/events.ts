import { z } from "zod";
import { SessionSchema, MobileDeviceSchema, TerminalOutputSchema } from "./sessions.js";

export const DESKTOP_EVENTS = [
  "session.created",
  "session.updated",
  "session.removed",
  "terminal.output",
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

export { TerminalOutputSchema };
