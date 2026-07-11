import type { ErrorCode } from "@cucoudle/protocol";

export class ProtocolError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ProtocolError";
    this.code = code;
    this.details = details;
  }
}
