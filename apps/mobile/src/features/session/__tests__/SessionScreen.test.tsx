import type { EventMessage, Session } from "@cucoudle/protocol";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { sessionReducer } from "../../../state/sessionReducer";
import {
  createInitialSessionState,
  type SessionState,
  type SessionSubscribeResult,
} from "../../../state/sessionState";
import { PlainTerminal, isNearTerminalEnd } from "../PlainTerminal";
import { SessionScreen, sessionKeyboardBehavior } from "../SessionScreen";
import { normalizeSessionRouteId } from "../../../app/session/[id]";

function session(status: Session["status"] = "running"): Session {
  return {
    id: "session-1",
    agent: "codex",
    title: "Ship mobile UI",
    command: "codex",
    argv: [],
    cwd: "/Users/alex/work/cucoudle",
    status,
    createdAt: "2026-07-11T09:00:00.000Z",
    lastActivityAt: "2026-07-11T10:00:00.000Z",
  };
}

function output(seq: number, data: string): EventMessage {
  return {
    version: "2026-07-11",
    kind: "event",
    event: "terminal.output",
    sentAt: `2026-07-11T10:00:0${seq}.000Z`,
    data: { sessionId: "session-1", seq, data },
  };
}

function subscribed(result: SessionSubscribeResult): SessionState {
  return sessionReducer(createInitialSessionState(), {
    type: "session/subscribeReceived",
    result,
  });
}

function renderScreen(
  state: SessionState,
  overrides: Partial<React.ComponentProps<typeof SessionScreen>> = {},
) {
  const props: React.ComponentProps<typeof SessionScreen> = {
    sessionId: "session-1",
    state,
    connectionStatus: "online",
    onSendInput: jest.fn().mockResolvedValue({ accepted: true }),
    onInterrupt: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const view = render(<SessionScreen {...props} />);
  return { ...view, props };
}

test.each([
  ["live", { session: session(), mode: "live" }],
  [
    "replay",
    { session: session(), mode: "replay", events: [output(2, "two"), output(1, "one ")] },
  ],
  [
    "snapshot",
    { session: session(), mode: "snapshot", terminalBuffer: "snapshot text", lastSeq: 8 },
  ],
] as const)("renders a %s subscription result", (mode, result) => {
  renderScreen(subscribed(result as SessionSubscribeResult));

  if (mode === "live") expect(screen.getByText("Вывод пока пуст")).toBeVisible();
  if (mode === "replay") expect(screen.getByText("one two")).toBeVisible();
  if (mode === "snapshot") expect(screen.getByText("snapshot text")).toBeVisible();
});

test("renders subsequent terminal output from updated state", () => {
  const initial = subscribed({ session: session(), mode: "live" });
  const { rerender, props } = renderScreen(initial);

  const next = sessionReducer(initial, { type: "event/received", event: output(1, "later") });
  rerender(<SessionScreen {...props} state={next} />);

  expect(screen.getByText("later")).toBeVisible();
});

test("shows agent, title, status, project basename, and connection in the header", () => {
  renderScreen(subscribed({ session: session("waiting"), mode: "live" }));

  expect(screen.getByText("codex")).toBeVisible();
  expect(screen.getByRole("header", { name: "Ship mobile UI" })).toBeVisible();
  expect(screen.getByText("waiting")).toBeVisible();
  expect(screen.getByText("cucoudle")).toBeVisible();
  expect(screen.getByText("Подключено")).toBeVisible();
});

test("stops controls after session.ended", () => {
  const initial = subscribed({ session: session(), mode: "live" });
  const stopped = sessionReducer(initial, {
    type: "event/received",
    event: {
      version: "2026-07-11",
      kind: "event",
      event: "session.ended",
      sentAt: "2026-07-11T10:10:00.000Z",
      data: { sessionId: "session-1", exitCode: 0 },
    },
  });
  renderScreen(stopped);

  expect(screen.getByText("Сессия завершена (код 0)")).toBeVisible();
  expect(screen.getByLabelText("Команда")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Прервать" })).toBeDisabled();
});

test("shows an unavailable state after session.removed", () => {
  const initial = subscribed({ session: session(), mode: "live" });
  const removed = sessionReducer(initial, {
    type: "event/received",
    event: {
      version: "2026-07-11",
      kind: "event",
      event: "session.removed",
      sentAt: "2026-07-11T10:10:00.000Z",
      data: { sessionId: "session-1" },
    },
  });
  renderScreen(removed);

  expect(screen.getByText("Сессия недоступна")).toBeVisible();
  expect(screen.queryByLabelText("Команда")).toBeNull();
});

test("navigates back to the session list from the header and unavailable state", () => {
  const onBack = jest.fn();
  const state = subscribed({ session: session(), mode: "live" });
  const { unmount } = renderScreen(state, { onBack });

  fireEvent.press(screen.getByTestId("session-back"));
  expect(onBack).toHaveBeenCalledTimes(1);
  unmount();

  renderScreen(createInitialSessionState(), { onBack });
  fireEvent.press(screen.getByTestId("session-back"));
  expect(onBack).toHaveBeenCalledTimes(2);
});

test("interrupts exactly once while pending and disables offline controls", async () => {
  let resolveInterrupt!: () => void;
  const pending = new Promise<void>((resolve) => { resolveInterrupt = resolve; });
  const onInterrupt = jest.fn(() => pending);
  const state = subscribed({ session: session(), mode: "live" });
  const { rerender, props } = renderScreen(state, { onInterrupt });

  const interrupt = screen.getByRole("button", { name: "Прервать" });
  fireEvent.press(interrupt);
  fireEvent.press(interrupt);
  expect(onInterrupt).toHaveBeenCalledTimes(1);
  expect(onInterrupt).toHaveBeenCalledWith({ sessionId: "session-1" });
  expect(interrupt).toBeDisabled();

  resolveInterrupt();
  await waitFor(() => expect(interrupt).toBeEnabled());
  rerender(<SessionScreen {...props} state={state} connectionStatus="offline" />);
  expect(screen.getByRole("button", { name: "Прервать" })).toBeDisabled();
  expect(screen.getByLabelText("Команда")).toBeDisabled();
});

test("keeps composer and interrupt read-only while connection is recovering", () => {
  const state = subscribed({ session: session(), mode: "live" });

  renderScreen(state, { connectionStatus: "recovery" });

  expect(screen.getByRole("button", { name: "Прервать" })).toBeDisabled();
  expect(screen.getByLabelText("Команда")).toBeDisabled();
  expect(screen.getByText("Восстанавливаем связь")).toBeVisible();
});

test.each([
  ["single id", "session-1", "session-1"],
  ["first array id", ["session-1", "session-2"], "session-1"],
  ["first nonempty array id", ["", "session-2"], "session-2"],
  ["blank id", "   ", ""],
  ["missing id", undefined, ""],
] as const)("normalizes $name from Expo route params", (_name, value, expected) => {
  expect(normalizeSessionRouteId(value)).toBe(expected);
});

test("reserves an action area above the composer", () => {
  renderScreen(subscribed({ session: session(), mode: "live" }), {
    actionArea: <PlainTerminal text="interaction action" />,
  });

  expect(screen.getByTestId("session-action-area")).toBeVisible();
  expect(screen.getByText("interaction action")).toBeVisible();
});

test.each([
  ["ios", "padding"],
  ["android", undefined],
  ["web", undefined],
] as const)("uses %s keyboard avoidance behavior", (platform, expected) => {
  expect(sessionKeyboardBehavior(platform)).toBe(expected);
});

test("wraps the open session in a keyboard-aware frame", () => {
  renderScreen(subscribed({ session: session(), mode: "live" }));

  const frame = screen.getByTestId("session-keyboard-frame");
  expect(frame).toBeVisible();
  expect(frame).toContainElement(screen.getByLabelText("Команда"));
});

test("plain terminal removes ANSI/control formatting but retains readable newlines", () => {
  render(<PlainTerminal text={"\u001b[31mred\u001b[0m\u0000\nnext\r\nline"} />);

  expect(screen.getByText("red\nnext\nline")).toBeVisible();
  expect(screen.getByTestId("plain-terminal").props.style).toEqual(
    expect.objectContaining({ minHeight: 0 }),
  );
  expect(screen.getByTestId("plain-terminal-text").props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ fontFamily: expect.any(String) })]),
  );
});

test("terminal follows output only while the reader is near the end", () => {
  expect(isNearTerminalEnd({ contentHeight: 1000, viewportHeight: 400, offsetY: 550 })).toBe(true);
  expect(isNearTerminalEnd({ contentHeight: 1000, viewportHeight: 400, offsetY: 200 })).toBe(false);
});
