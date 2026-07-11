import type {
  EventMessage,
  InteractionRequest,
  Session,
} from "@cucoudle/protocol";
import type { TerminalBuffer } from "./terminalBuffer";

export type ActivityFactType = "created" | "updated" | "ended" | "removed";

export interface ActivityFact {
  id: string;
  sessionId: string;
  type: ActivityFactType;
  at: string;
  status?: Session["status"];
  title?: string;
  exitCode?: number;
}

export interface SessionSubscribeResult {
  session: Session;
  mode: "replay" | "snapshot" | "live";
  events?: EventMessage[];
  terminalBuffer?: string;
  lastSeq?: number;
  activeInteraction?: InteractionRequest;
}

export interface SessionState {
  sessionsById: Record<string, Session>;
  sessionIds: string[];
  terminalBySessionId: Record<string, TerminalBuffer>;
  activeInteractionsBySessionId: Record<string, InteractionRequest>;
  dismissedAttentionKeys: Record<string, true>;
  activity: ActivityFact[];
  openSessionId?: string;
  subscribedSessionId?: string;
}

export type SessionAction =
  | { type: "session/listReceived"; sessions: Session[] }
  | { type: "session/subscribeReceived"; result: SessionSubscribeResult }
  | { type: "event/received"; event: EventMessage }
  | { type: "attention/dismissed"; key: string }
  | { type: "session/opened"; sessionId?: string }
  | { type: "session/subscriptionChanged"; sessionId?: string };

export function createInitialSessionState(): SessionState {
  return {
    sessionsById: {},
    sessionIds: [],
    terminalBySessionId: {},
    activeInteractionsBySessionId: {},
    dismissedAttentionKeys: {},
    activity: [],
  };
}
