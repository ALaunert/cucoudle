// Pairing helpers currently live in state.ts; this module re-exports the
// pairing-facing surface so handlers have a stable import path if the
// implementation is split later.
export { generatePairingCode, newId } from "./state.js";
