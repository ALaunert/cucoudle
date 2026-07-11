// Optional protocol features are enabled only from the negotiated intersection
// of mobile, relay and desktop offers. Absence of the capability fields means a
// compatible baseline with no structured interactions (raw terminal only).
export const INTERACTION_STRUCTURED = "interaction.structured";

export const PROTOCOL_CAPABILITIES = [INTERACTION_STRUCTURED] as const;
export type ProtocolCapability = (typeof PROTOCOL_CAPABILITIES)[number];
