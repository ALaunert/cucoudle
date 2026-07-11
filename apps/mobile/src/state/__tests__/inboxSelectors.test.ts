import type { Session } from "@cucoudle/protocol";
import {
  makeDismissalKey,
  selectAttentionCards,
  selectRecentActivity,
  selectSessions,
} from "../inboxSelectors";
import { createInitialSessionState, type ActivityFact } from "../sessionState";

function session(
  id: string,
  status: Session["status"],
  lastActivityAt: string,
  exitCode?: number,
): Session {
  return {
    id,
    agent: "codex",
    title: id,
    command: "codex",
    argv: [],
    cwd: "/tmp",
    status,
    createdAt: "2026-07-11T08:00:00.000Z",
    lastActivityAt,
    ...(exitCode === undefined ? {} : { exitCode }),
  };
}

describe("inboxSelectors", () => {
  const sessions = [
    session("waiting-old", "waiting", "2026-07-11T10:00:00.000Z"),
    session("waiting-new", "waiting", "2026-07-11T10:05:00.000Z"),
    session("error", "error", "2026-07-11T10:10:00.000Z", 1),
    session("stopped", "stopped", "2026-07-11T10:20:00.000Z", 0),
    session("running", "running", "2026-07-11T10:30:00.000Z"),
    session("starting", "starting", "2026-07-11T10:40:00.000Z"),
  ];
  const state = {
    ...createInitialSessionState(),
    sessionsById: Object.fromEntries(sessions.map((item) => [item.id, item])),
    sessionIds: sessions.map((item) => item.id),
  };

  it("orders attention by waiting, error, stopped and then newest within priority", () => {
    expect(selectAttentionCards(state).map((item) => item.id)).toEqual([
      "waiting-new",
      "waiting-old",
      "error",
      "stopped",
    ]);
  });

  it("omits exactly dismissed attention versions", () => {
    const dismissedKey = makeDismissalKey(sessions[1]);
    const dismissed = {
      ...state,
      dismissedAttentionKeys: { [dismissedKey]: true as const },
    };

    expect(selectAttentionCards(dismissed).map((item) => item.id)).not.toContain("waiting-new");
    expect(makeDismissalKey(sessions[2])).toBe(
      "error:error:2026-07-11T10:10:00.000Z:1",
    );
    expect(makeDismissalKey(sessions[0])).toBe(
      "waiting-old:waiting:2026-07-11T10:00:00.000Z",
    );
  });

  it("filters sessions, pins waiting first, and keeps newest-first order within groups", () => {
    expect(selectSessions(state, "active").map((item) => item.id)).toEqual([
      "waiting-new",
      "waiting-old",
      "starting",
      "running",
    ]);
    expect(selectSessions(state, "completed").map((item) => item.id)).toEqual([
      "stopped",
      "error",
    ]);
    expect(selectSessions(state, "all").map((item) => item.id)).toEqual([
      "waiting-new",
      "waiting-old",
      "starting",
      "running",
      "stopped",
      "error",
    ]);
  });

  it("returns at most 20 lifecycle facts, newest first without mutating state", () => {
    const activity: ActivityFact[] = Array.from({ length: 24 }, (_, index) => ({
      id: `fact-${index}`,
      sessionId: "running",
      type: "updated",
      status: "running",
      at: `2026-07-11T10:${String(index).padStart(2, "0")}:00.000Z`,
    }));
    const withActivity = { ...state, activity };

    expect(selectRecentActivity(withActivity)).toHaveLength(20);
    expect(selectRecentActivity(withActivity)[0]?.id).toBe("fact-23");
    expect(withActivity.activity[0]?.id).toBe("fact-0");
  });
});
