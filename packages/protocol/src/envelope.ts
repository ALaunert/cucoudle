import { z } from "zod";

export const PROTOCOL_VERSION = "2026-07-11" as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export const ERROR_CODES = [
  "INVALID_MESSAGE",
  "UNSUPPORTED_PROTOCOL",
  "UNSUPPORTED_METHOD",
  "UNAUTHORIZED",
  "PAIRING_EXPIRED",
  "PAIRING_NOT_FOUND",
  "DESKTOP_OFFLINE",
  "MOBILE_NOT_PAIRED",
  "SESSION_NOT_FOUND",
  "SESSION_STOPPED",
  "TOOL_NOT_FOUND",
  "DAEMON_UNAVAILABLE",
  "PTY_WRITE_FAILED",
  "INTERACTION_NOT_FOUND",
  "INTERACTION_STALE",
  "INTERNAL_ERROR",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ProtocolErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;

const VersionSchema = z.literal(PROTOCOL_VERSION);

export const RequestMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("request"),
  id: z.string(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  sentAt: z.string(),
});
export type RequestMessage = z.infer<typeof RequestMessageSchema>;

export const ResponseMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("response"),
  id: z.string(),
  ok: z.boolean(),
  result: z.record(z.unknown()).optional(),
  error: ProtocolErrorSchema.optional(),
  sentAt: z.string(),
});
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

export const EventMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("event"),
  event: z.string(),
  data: z.record(z.unknown()),
  sentAt: z.string(),
});
export type EventMessage = z.infer<typeof EventMessageSchema>;

export const WireMessageSchema = z.discriminatedUnion("kind", [
  RequestMessageSchema,
  ResponseMessageSchema,
  EventMessageSchema,
]);
export type WireMessage = z.infer<typeof WireMessageSchema>;

export function isRequest(m: WireMessage): m is RequestMessage {
  return m.kind === "request";
}
export function isResponse(m: WireMessage): m is ResponseMessage {
  return m.kind === "response";
}
export function isEvent(m: WireMessage): m is EventMessage {
  return m.kind === "event";
}

type ParseResult =
  | { ok: true; msg: WireMessage }
  | { ok: false; id: string; code: ErrorCode; message: string };

export function parseWireMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, id: "", code: "INVALID_MESSAGE", message: "payload is not valid JSON" };
  }
  const id =
    typeof json === "object" && json !== null && "id" in json && typeof json.id === "string"
      ? json.id
      : "";
  if (
    typeof json === "object" &&
    json !== null &&
    "version" in json &&
    (json as { version: unknown }).version !== PROTOCOL_VERSION
  ) {
    return {
      ok: false,
      id,
      code: "UNSUPPORTED_PROTOCOL",
      message: `expected protocol ${PROTOCOL_VERSION}`,
    };
  }
  const parsed = WireMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, id, code: "INVALID_MESSAGE", message: parsed.error.message };
  }
  return { ok: true, msg: parsed.data };
}

export function makeResponse(id: string, result: Record<string, unknown>): ResponseMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "response",
    id,
    ok: true,
    result,
    sentAt: new Date().toISOString(),
  };
}

export function makeError(
  id: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ResponseMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "response",
    id,
    ok: false,
    error: details ? { code, message, details } : { code, message },
    sentAt: new Date().toISOString(),
  };
}

export function makeEvent(event: string, data: Record<string, unknown>): EventMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "event",
    event,
    data,
    sentAt: new Date().toISOString(),
  };
}
