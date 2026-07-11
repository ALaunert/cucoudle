import type { Session } from "@cucoudle/protocol";
import type { ActivityFact, SessionState } from "./sessionState";

export type SessionFilter = "all" | "active" | "completed";

const ATTENTION_PRIORITY: Partial<Record<Session["status"], number>> = {
  waiting: 0,
  error: 1,
  stopped: 2,
};

const ACTIVE_STATUSES = new Set<Session["status"]>([
  "starting",
  "running",
  "waiting",
]);
const COMPLETED_STATUSES = new Set<Session["status"]>(["stopped", "error"]);

function newestFirst(left: Session, right: Session): number {
  return Date.parse(right.lastActivityAt) - Date.parse(left.lastActivityAt);
}

export function makeDismissalKey(session: Session): string {
  const base = `${session.id}:${session.status}:${session.lastActivityAt}`;
  return session.exitCode === undefined ? base : `${base}:${session.exitCode}`;
}

export function selectAttentionCards(state: SessionState): Session[] {
  return state.sessionIds
    .map((id) => state.sessionsById[id])
    .filter((session): session is Session => {
      return (
        session !== undefined &&
        ATTENTION_PRIORITY[session.status] !== undefined &&
        !state.dismissedAttentionKeys[makeDismissalKey(session)]
      );
    })
    .sort((left, right) => {
      const priority =
        (ATTENTION_PRIORITY[left.status] ?? Number.MAX_SAFE_INTEGER) -
        (ATTENTION_PRIORITY[right.status] ?? Number.MAX_SAFE_INTEGER);
      return priority || newestFirst(left, right);
    });
}

export function selectSessions(state: SessionState, filter: SessionFilter): Session[] {
  return state.sessionIds
    .map((id) => state.sessionsById[id])
    .filter((session): session is Session => {
      if (!session) return false;
      if (filter === "active") return ACTIVE_STATUSES.has(session.status);
      if (filter === "completed") return COMPLETED_STATUSES.has(session.status);
      return true;
    })
    .sort(newestFirst);
}

export function selectRecentActivity(state: SessionState): ActivityFact[] {
  return [...state.activity]
    .sort((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, 20);
}
