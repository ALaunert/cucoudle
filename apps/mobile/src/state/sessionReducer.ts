import type {
  EventMessage,
  InteractionRequest,
  Session,
  StyledLine,
  TerminalOutput,
} from "@cucoudle/protocol";
import {
  type ActivityFact,
  type SessionAction,
  type SessionState,
} from "./sessionState";
import {
  applyRenderFrame,
  createRenderBuffer,
  replaceRenderSnapshot,
} from "./renderBuffer";
import {
  appendTerminalOutput,
  createTerminalBuffer,
  replaceTerminalSnapshot,
} from "./terminalBuffer";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function eventSession(event: EventMessage): Session | undefined {
  const value = event.data.session;
  return isRecord(value) && typeof value.id === "string" ? (value as Session) : undefined;
}

function eventInteraction(event: EventMessage): InteractionRequest | undefined {
  const value = event.data.interaction;
  return isRecord(value) && typeof value.id === "string"
    ? (value as InteractionRequest)
    : undefined;
}

function eventSessionId(event: EventMessage): string | undefined {
  return typeof event.data.sessionId === "string" ? event.data.sessionId : undefined;
}

function addActivity(state: SessionState, fact: ActivityFact): SessionState {
  return { ...state, activity: [...state.activity, fact].slice(-20) };
}

function makeActivity(
  event: EventMessage,
  sessionId: string,
  type: ActivityFact["type"],
  session?: Session,
  exitCode?: number,
): ActivityFact {
  return {
    id: `${event.sentAt}:${event.event}:${sessionId}`,
    sessionId,
    type,
    at: event.sentAt,
    ...(session?.status === undefined ? {} : { status: session.status }),
    ...(session?.title === undefined ? {} : { title: session.title }),
    ...(exitCode === undefined ? {} : { exitCode }),
  };
}

function upsertSession(state: SessionState, session: Session): SessionState {
  const exists = state.sessionsById[session.id] !== undefined;
  return {
    ...state,
    sessionsById: { ...state.sessionsById, [session.id]: session },
    sessionIds: exists ? state.sessionIds : [...state.sessionIds, session.id],
  };
}

function omitKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

function terminalReplayCoordinates(
  event: EventMessage,
): { sessionId: string; seq: number } | undefined {
  if (event.event !== "terminal.output") return undefined;
  const { sessionId, seq } = event.data;
  return typeof sessionId === "string" && typeof seq === "number"
    ? { sessionId, seq }
    : undefined;
}

function orderReplayEvents(events: readonly EventMessage[]): EventMessage[] {
  const terminalBySession = new Map<string, EventMessage[]>();
  for (const event of events) {
    const coordinates = terminalReplayCoordinates(event);
    if (!coordinates) continue;
    const queued = terminalBySession.get(coordinates.sessionId) ?? [];
    queued.push(event);
    terminalBySession.set(coordinates.sessionId, queued);
  }
  for (const queued of terminalBySession.values()) {
    queued.sort((left, right) => {
      return (
        (terminalReplayCoordinates(left)?.seq ?? 0) -
        (terminalReplayCoordinates(right)?.seq ?? 0)
      );
    });
  }

  const nextIndexBySession = new Map<string, number>();
  return events.map((event) => {
    const coordinates = terminalReplayCoordinates(event);
    if (!coordinates) return event;
    const index = nextIndexBySession.get(coordinates.sessionId) ?? 0;
    nextIndexBySession.set(coordinates.sessionId, index + 1);
    return terminalBySession.get(coordinates.sessionId)?.[index] ?? event;
  });
}

function receiveEvent(state: SessionState, event: EventMessage): SessionState {
  if (event.event === "session.created" || event.event === "session.updated") {
    const session = eventSession(event);
    if (!session) return state;
    const type = event.event === "session.created" ? "created" : "updated";
    return addActivity(
      upsertSession(state, session),
      makeActivity(event, session.id, type, session),
    );
  }

  if (event.event === "terminal.output") {
    const { sessionId, seq, data } = event.data;
    if (typeof sessionId !== "string" || typeof seq !== "number" || typeof data !== "string") {
      return state;
    }
    const chunk: Pick<TerminalOutput, "seq" | "data"> = { seq, data };
    const current = state.terminalBySessionId[sessionId] ?? createTerminalBuffer();
    const next = appendTerminalOutput(current, chunk);
    if (next === current) return state;
    return {
      ...state,
      terminalBySessionId: { ...state.terminalBySessionId, [sessionId]: next },
    };
  }

  if (event.event === "terminal.render") {
    const { sessionId, seq, historyAppend, screen } = event.data;
    if (
      typeof sessionId !== "string" ||
      typeof seq !== "number" ||
      !Array.isArray(historyAppend) ||
      !Array.isArray(screen)
    ) {
      return state;
    }
    const current = state.renderBySessionId[sessionId] ?? createRenderBuffer();
    const next = applyRenderFrame(current, {
      seq,
      historyAppend: historyAppend as StyledLine[],
      screen: screen as StyledLine[],
    });
    if (next === current) return state;
    return {
      ...state,
      renderBySessionId: { ...state.renderBySessionId, [sessionId]: next },
    };
  }

  if (event.event === "interaction.requested" || event.event === "interaction.updated") {
    const interaction = eventInteraction(event);
    if (!interaction) return state;
    return {
      ...state,
      activeInteractionsBySessionId: {
        ...state.activeInteractionsBySessionId,
        [interaction.sessionId]: interaction,
      },
    };
  }

  if (event.event === "interaction.resolved") {
    const sessionId = eventSessionId(event);
    if (!sessionId) return state;
    return {
      ...state,
      activeInteractionsBySessionId: omitKey(
        state.activeInteractionsBySessionId,
        sessionId,
      ),
    };
  }

  if (event.event === "session.ended") {
    const sessionId = eventSessionId(event);
    const current = sessionId ? state.sessionsById[sessionId] : undefined;
    if (!sessionId || !current) return state;
    const exitCode = typeof event.data.exitCode === "number" ? event.data.exitCode : undefined;
    const ended: Session = {
      ...current,
      status: "stopped",
      lastActivityAt: event.sentAt,
      ...(exitCode === undefined ? {} : { exitCode }),
    };
    return addActivity(
      upsertSession(state, ended),
      makeActivity(event, sessionId, "ended", ended, exitCode),
    );
  }

  if (event.event === "session.removed") {
    const sessionId = eventSessionId(event);
    if (!sessionId) return state;
    const removed = state.sessionsById[sessionId];
    const dismissedAttentionKeys = Object.fromEntries(
      Object.entries(state.dismissedAttentionKeys).filter(
        ([key]) => !key.startsWith(`${sessionId}:`),
      ),
    );
    const cleaned: SessionState = {
      ...state,
      sessionsById: omitKey(state.sessionsById, sessionId),
      sessionIds: state.sessionIds.filter((id) => id !== sessionId),
      terminalBySessionId: omitKey(state.terminalBySessionId, sessionId),
      renderBySessionId: omitKey(state.renderBySessionId, sessionId),
      activeInteractionsBySessionId: omitKey(
        state.activeInteractionsBySessionId,
        sessionId,
      ),
      dismissedAttentionKeys,
      ...(state.openSessionId === sessionId ? { openSessionId: undefined } : {}),
      ...(state.subscribedSessionId === sessionId
        ? { subscribedSessionId: undefined }
        : {}),
    };
    return addActivity(
      cleaned,
      makeActivity(event, sessionId, "removed", removed),
    );
  }

  return state;
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  if (action.type === "session/listReceived") {
    return {
      ...state,
      sessionsById: Object.fromEntries(action.sessions.map((session) => [session.id, session])),
      sessionIds: action.sessions.map((session) => session.id),
    };
  }

  if (action.type === "session/subscribeReceived") {
    const { result } = action;
    let next = upsertSession(state, result.session);
    next = {
      ...next,
      openSessionId: result.session.id,
      subscribedSessionId: result.session.id,
      activeInteractionsBySessionId: result.activeInteraction
        ? {
            ...next.activeInteractionsBySessionId,
            [result.session.id]: result.activeInteraction,
          }
        : omitKey(next.activeInteractionsBySessionId, result.session.id),
    };

    if (result.mode === "snapshot") {
      next = {
        ...next,
        terminalBySessionId: {
          ...next.terminalBySessionId,
          [result.session.id]: replaceTerminalSnapshot(
            next.terminalBySessionId[result.session.id] ?? createTerminalBuffer(),
            result.terminalBuffer ?? "",
            result.lastSeq ?? 0,
          ),
        },
      };
    }

    if (result.mode === "replay") {
      next = orderReplayEvents(result.events ?? []).reduce(receiveEvent, next);
    }

    if (result.terminalRender) {
      next = {
        ...next,
        renderBySessionId: {
          ...next.renderBySessionId,
          [result.session.id]: replaceRenderSnapshot(result.terminalRender),
        },
      };
    }

    return next;
  }

  if (action.type === "event/received") {
    return receiveEvent(state, action.event);
  }

  if (action.type === "attention/dismissed") {
    return {
      ...state,
      dismissedAttentionKeys: { ...state.dismissedAttentionKeys, [action.key]: true },
    };
  }

  if (action.type === "session/opened") {
    return { ...state, openSessionId: action.sessionId };
  }

  return { ...state, subscribedSessionId: action.sessionId };
}
