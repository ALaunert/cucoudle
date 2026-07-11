export type RelayAuditFields = Record<string, string | number | boolean | undefined>;
export type RelayAuditLogger = (event: string, fields?: RelayAuditFields) => void;

export const NOOP_AUDIT_LOGGER: RelayAuditLogger = () => undefined;

export const JSON_AUDIT_LOGGER: RelayAuditLogger = (event, fields = {}) => {
  const definedFields = Object.fromEntries(
    Object.entries(fields).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined),
  );
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    component: "relay",
    event,
    ...definedFields,
  }));
};
