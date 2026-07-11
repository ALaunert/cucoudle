import type { Session } from "@cucoudle/protocol";
import { render, screen, within } from "@testing-library/react-native";

import { createInitialSessionState, type ActivityFact } from "../../../state/sessionState";
import { InboxScreen } from "../InboxScreen";

function session(id: string, status: Session["status"]): Session {
  return {
    id,
    agent: "codex",
    title: `${id} task`,
    command: "codex",
    argv: [],
    cwd: "/tmp",
    status,
    createdAt: "2026-07-11T08:00:00.000Z",
    lastActivityAt: "2026-07-11T10:00:00.000Z",
    ...(status === "error" ? { exitCode: 1 } : {}),
  };
}

const activity: ActivityFact = {
  id: "activity-1",
  sessionId: "running",
  type: "updated",
  status: "running",
  title: "Background task",
  at: "2026-07-11T10:01:00.000Z",
};

const callbacks = {
  onDismissAttention: jest.fn(),
  onOpenSession: jest.fn(),
  onViewSession: jest.fn(),
};

test("shows title and actionable count, with priority cards before recent activity", () => {
  render(
    <InboxScreen
      {...callbacks}
      attentionCards={[
        session("waiting", "waiting"),
        session("error", "error"),
        session("stopped", "stopped"),
      ]}
      connectionStatus="connected"
      recentActivity={[activity]}
    />,
  );

  expect(screen.getByRole("header", { name: "Входящие" })).toBeVisible();
  expect(screen.getByText("3 требуют внимания")).toBeVisible();

  const content = screen.getByTestId("inbox-content");
  const visibleText = within(content).getAllByText(/.+/).map((node) => node.props.children);
  expect(visibleText.indexOf("Агент ждёт вашего ответа")).toBeLessThan(
    visibleText.indexOf("Последняя активность"),
  );
  expect(visibleText.indexOf("Сессия завершилась с ошибкой")).toBeLessThan(
    visibleText.indexOf("Последняя активность"),
  );
  expect(visibleText.indexOf("Сессия завершена")).toBeLessThan(
    visibleText.indexOf("Последняя активность"),
  );
  expect(screen.queryByText("Разрешить")).not.toBeOnTheScreen();
  expect(screen.queryByText("Отклонить")).not.toBeOnTheScreen();
});

test("derives attention and recent activity from selector-ready state", () => {
  const waiting = session("waiting", "waiting");
  const state = {
    ...createInitialSessionState(),
    sessionsById: { [waiting.id]: waiting },
    sessionIds: [waiting.id],
    activity: [activity],
  };

  render(<InboxScreen {...callbacks} connectionStatus="connected" state={state} />);

  expect(screen.getByText("1 требует внимания")).toBeVisible();
  expect(screen.getByText("Background task")).toBeVisible();
});

test("shows a connected empty state when there is no attention or activity", () => {
  render(
    <InboxScreen
      {...callbacks}
      attentionCards={[]}
      connectionStatus="connected"
      recentActivity={[]}
    />,
  );

  expect(screen.getByText("Входящих пока нет")).toBeVisible();
  expect(screen.getByText("Здесь появятся события, требующие внимания.")).toBeVisible();
});

test("shows reconnecting state without claiming the inbox is empty", () => {
  render(
    <InboxScreen
      {...callbacks}
      attentionCards={[]}
      connectionStatus="reconnecting"
      recentActivity={[]}
    />,
  );

  expect(screen.getByText("Восстанавливаем соединение…")).toBeVisible();
  expect(screen.getByText("Ждём актуальные данные")).toBeVisible();
  expect(screen.queryByText("Входящих пока нет")).not.toBeOnTheScreen();
});

test("marks cached content as stale while offline", () => {
  render(
    <InboxScreen
      {...callbacks}
      attentionCards={[session("waiting", "waiting")]}
      connectionStatus="offline"
      recentActivity={[activity]}
    />,
  );

  expect(screen.getByText("Офлайн")).toBeVisible();
  expect(screen.getByText("Показаны сохранённые данные")).toBeVisible();
  expect(screen.getByText("Агент ждёт вашего ответа")).toBeVisible();
});
