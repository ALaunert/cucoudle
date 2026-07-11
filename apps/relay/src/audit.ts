export type RelayAuditFields = Record<string, unknown>;
export type RelayAuditLogger = (event: string, fields?: RelayAuditFields) => void;

export const NOOP_AUDIT_LOGGER: RelayAuditLogger = () => undefined;

export const JSON_AUDIT_LOGGER: RelayAuditLogger = (event, fields = {}) => {
  const definedFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  );
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    component: "relay",
    event,
    ...definedFields,
  }));
};

const SENSITIVE_FIELD = /token|pairingcode|secret|password|authorization/i;

export function redactPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPayload);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    SENSITIVE_FIELD.test(key) ? "<redacted>" : redactPayload(nested),
  ]));
}
