import type {
  EventMessage,
  InteractionRequest,
  Session,
} from "@cucoudle/protocol";
import { sessionReducer } from "../sessionReducer";
import {
  createInitialSessionState,
  type SessionSubscribeResult,
} from "../sessionState";

function session(
  id: string,
  status: Session["status"] = "running",
  lastActivityAt = "2026-07-11T10:00:00.000Z",
): Session {
  return {
    id,
    agent: "codex",
    title: id,
    command: "codex",
    argv: [],
    cwd: "/tmp",
    status,
    createdAt: "2026-07-11T09:00:00.000Z",
    lastActivityAt,
  };
}

function event(eventName: string, data: Record<string, unknown>, sentAt: string): EventMessage {
  return { version: "2026-07-11", kind: "event", event: eventName, data, sentAt };
}

const interaction: InteractionRequest = {
  id: "interaction-1",
  sessionId: "s1",
  kind: "approval",
  prompt: "Allow?",
  options: [{ id: "yes", label: "Yes", intent: "approve" }],
  allowsText: false,
  allowsTerminalInput: true,
  createdAt: "2026-07-11T10:02:00.000Z",
};

describe("sessionReducer", () => {
  it("treats session.list as an authoritative replacement", () => {
    let state = sessionReducer(createInitialSessionState(), {
      type: "session/listReceived",
      sessions: [session("local", "running")],
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "session.ended",
        { sessionId: "local", exitCode: 7 },
        "2026-07-11T10:05:00.000Z",
      ),
    });

    state = sessionReducer(state, {
      type: "session/listReceived",
      sessions: [session("server", "running", "2026-07-11T10:06:00.000Z")],
    });

    expect(state.sessionIds).toEqual(["server"]);
    expect(state.sessionsById.local).toBeUndefined();
    expect(state.sessionsById.server?.status).toBe("running");
  });

  it("handles created and updated session events", () => {
    let state = sessionReducer(createInitialSessionState(), {
      type: "event/received",
      event: event("session.created", { session: session("s1") }, "2026-07-11T10:00:01.000Z"),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "session.updated",
        { session: session("s1", "waiting", "2026-07-11T10:00:02.000Z") },
        "2026-07-11T10:00:02.000Z",
      ),
    });

    expect(state.sessionIds).toEqual(["s1"]);
    expect(state.sessionsById.s1?.status).toBe("waiting");
    expect(state.activity.map((fact) => fact.type)).toEqual(["created", "updated"]);
  });

  it("appends terminal output and tracks active interaction events", () => {
    let state = sessionReducer(createInitialSessionState(), {
      type: "event/received",
      event: event("terminal.output", { sessionId: "s1", seq: 2, data: "hello" }, "2026-07-11T10:01:00.000Z"),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event("interaction.requested", { interaction }, "2026-07-11T10:02:00.000Z"),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event("interaction.updated", { interaction: { ...interaction, prompt: "Still allow?" } }, "2026-07-11T10:03:00.000Z"),
    });

    expect(state.terminalBySessionId.s1).toEqual({ text: "hello", lastSeq: 2 });
    expect(state.activeInteractionsBySessionId.s1?.prompt).toBe("Still allow?");

    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "interaction.resolved",
        { interactionId: interaction.id, sessionId: "s1", resolution: "answered", resolvedAt: "2026-07-11T10:04:00.000Z" },
        "2026-07-11T10:04:00.000Z",
      ),
    });
    expect(state.activeInteractionsBySessionId.s1).toBeUndefined();
  });

  it.each(["replay", "snapshot", "live"] as const)(
    "hydrates a %s subscription result and records the open subscription",
    (mode) => {
      const result: SessionSubscribeResult = {
        session: session("s1"),
        mode,
        ...(mode === "snapshot" ? { terminalBuffer: "snapshot", lastSeq: 10 } : {}),
        ...(mode === "replay"
          ? {
              events: [
                event("terminal.output", { sessionId: "s1", seq: 4, data: "four" }, "2026-07-11T10:04:00.000Z"),
                event("terminal.output", { sessionId: "s1", seq: 3, data: "three" }, "2026-07-11T10:03:00.000Z"),
              ],
            }
          : {}),
        activeInteraction: interaction,
      };

      const state = sessionReducer(createInitialSessionState(), {
        type: "session/subscribeReceived",
        result,
      });

      expect(state.openSessionId).toBe("s1");
      expect(state.subscribedSessionId).toBe("s1");
      expect(state.activeInteractionsBySessionId.s1).toEqual(interaction);
      if (mode === "snapshot") {
        expect(state.terminalBySessionId.s1).toEqual({ text: "snapshot", lastSeq: 10 });
      } else if (mode === "replay") {
        expect(state.terminalBySessionId.s1).toEqual({ text: "threefour", lastSeq: 4 });
      }
    },
  );

  it("orders replay terminal output by sequence without reordering lifecycle envelopes", () => {
    const state = sessionReducer(createInitialSessionState(), {
      type: "session/subscribeReceived",
      result: {
        session: session("s1", "starting"),
        mode: "replay",
        events: [
          event(
            "terminal.output",
            { sessionId: "s1", seq: 4, data: "four" },
            "2026-07-11T10:00:00.000Z",
          ),
          event(
            "session.updated",
            { session: session("s1", "waiting") },
            "2026-07-11T10:04:00.000Z",
          ),
          event(
            "session.updated",
            { session: session("s1", "running") },
            "2026-07-11T10:01:00.000Z",
          ),
          event(
            "terminal.output",
            { sessionId: "s1", seq: 3, data: "three" },
            "2026-07-11T10:05:00.000Z",
          ),
        ],
      },
    });

    expect(state.terminalBySessionId.s1).toEqual({ text: "threefour", lastSeq: 4 });
    expect(state.sessionsById.s1?.status).toBe("running");
  });

  it("patches ended sessions as stopped even for nonzero exit codes", () => {
    let state = sessionReducer(createInitialSessionState(), {
      type: "session/listReceived",
      sessions: [session("s1")],
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "session.ended",
        { sessionId: "s1", exitCode: 23 },
        "2026-07-11T10:09:00.000Z",
      ),
    });

    expect(state.sessionsById.s1).toMatchObject({
      status: "stopped",
      exitCode: 23,
      lastActivityAt: "2026-07-11T10:09:00.000Z",
    });
  });

  it("removes all per-session state, dismissal keys and open detail", () => {
    const s1 = session("s1", "waiting");
    let state = sessionReducer(createInitialSessionState(), {
      type: "session/listReceived",
      sessions: [s1],
    });
    state = sessionReducer(state, { type: "session/opened", sessionId: "s1" });
    state = sessionReducer(state, { type: "session/subscriptionChanged", sessionId: "s1" });
    state = sessionReducer(state, { type: "attention/dismissed", key: "s1:waiting:old" });
    state = sessionReducer(state, {
      type: "event/received",
      event: event("terminal.output", { sessionId: "s1", seq: 1, data: "data" }, "2026-07-11T10:01:00.000Z"),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event("interaction.requested", { interaction }, "2026-07-11T10:02:00.000Z"),
    });

    state = sessionReducer(state, {
      type: "event/received",
      event: event("session.removed", { sessionId: "s1" }, "2026-07-11T10:05:00.000Z"),
    });

    expect(state.sessionsById.s1).toBeUndefined();
    expect(state.sessionIds).toEqual([]);
    expect(state.terminalBySessionId.s1).toBeUndefined();
    expect(state.activeInteractionsBySessionId.s1).toBeUndefined();
    expect(state.dismissedAttentionKeys).toEqual({});
    expect(state.openSessionId).toBeUndefined();
    expect(state.subscribedSessionId).toBeUndefined();
  });

  it("accumulates terminal.render frames and clears them on session.removed", () => {
    let state = sessionReducer(createInitialSessionState(), {
      type: "event/received",
      event: event("session.created", { session: session("s1") }, "2026-07-11T10:00:00.000Z"),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "terminal.render",
        { sessionId: "s1", seq: 1, historyAppend: [[{ t: "old" }]], screen: [[{ t: "live" }]] },
        "2026-07-11T10:01:00.000Z",
      ),
    });
    state = sessionReducer(state, {
      type: "event/received",
      event: event(
        "terminal.render",
        { sessionId: "s1", seq: 2, historyAppend: [], screen: [[{ t: "live 2", fg: "red" }]] },
        "2026-07-11T10:02:00.000Z",
      ),
    });

    expect(state.renderBySessionId.s1.history).toEqual([[{ t: "old" }]]);
    expect(state.renderBySessionId.s1.screen).toEqual([[{ t: "live 2", fg: "red" }]]);
    expect(state.renderBySessionId.s1.lastSeq).toBe(2);

    state = sessionReducer(state, {
      type: "event/received",
      event: event("session.removed", { sessionId: "s1" }, "2026-07-11T10:05:00.000Z"),
    });
    expect(state.renderBySessionId.s1).toBeUndefined();
  });

  it("hydrates render state from a subscribe snapshot", () => {
    const result: SessionSubscribeResult = {
      session: session("s1"),
      mode: "snapshot",
      terminalBuffer: "raw",
      lastSeq: 10,
      terminalRender: {
        history: [[{ t: "history line" }]],
        screen: [[{ t: "screen line", b: true }]],
        lastSeq: 4,
      },
    };
    const state = sessionReducer(createInitialSessionState(), {
      type: "session/subscribeReceived",
      result,
    });
    expect(state.renderBySessionId.s1).toEqual({
      history: [[{ t: "history line" }]],
      screen: [[{ t: "screen line", b: true }]],
      lastSeq: 4,
    });
  });
});
