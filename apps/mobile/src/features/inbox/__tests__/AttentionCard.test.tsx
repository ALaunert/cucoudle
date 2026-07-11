import type { Session } from "@cucoudle/protocol";
import { fireEvent, render, screen } from "@testing-library/react-native";

import { makeDismissalKey } from "../../../state/inboxSelectors";
import { AttentionCard } from "../AttentionCard";

function session(status: Session["status"], exitCode?: number): Session {
  return {
    id: `${status}-session`,
    agent: "codex",
    title: `${status} task`,
    command: "codex",
    argv: [],
    cwd: "/tmp",
    status,
    createdAt: "2026-07-11T08:00:00.000Z",
    lastActivityAt: "2026-07-11T10:00:00.000Z",
    ...(exitCode === undefined ? {} : { exitCode }),
  };
}

test("opens a waiting session without permission decision controls", () => {
  const onOpen = jest.fn();
  const item = session("waiting");

  render(
    <AttentionCard
      session={item}
      onDismiss={jest.fn()}
      onOpen={onOpen}
      onView={jest.fn()}
    />,
  );

  expect(screen.getByText("Агент ждёт вашего ответа")).toBeVisible();
  fireEvent.press(screen.getByRole("button", { name: "Открыть сессию" }));
  expect(onOpen).toHaveBeenCalledWith(item.id);
  expect(screen.queryByText("Разрешить")).not.toBeOnTheScreen();
  expect(screen.queryByText("Отклонить")).not.toBeOnTheScreen();
});

test.each([
  ["error", 1, "Сессия завершилась с ошибкой", "Посмотреть терминал"],
  ["stopped", 0, "Сессия завершена", "Посмотреть результат"],
] as const)("views a %s terminal state", (status, exitCode, copy, action) => {
  const onView = jest.fn();
  const item = session(status, exitCode);

  render(
    <AttentionCard
      session={item}
      onDismiss={jest.fn()}
      onOpen={jest.fn()}
      onView={onView}
    />,
  );

  expect(screen.getByText(copy)).toBeVisible();
  fireEvent.press(screen.getByRole("button", { name: action }));
  expect(onView).toHaveBeenCalledWith(item.id);
});

test("opens a waiting session when the card body is tapped", () => {
  const onOpen = jest.fn();
  const item = session("waiting");

  render(
    <AttentionCard
      session={item}
      onDismiss={jest.fn()}
      onOpen={onOpen}
      onView={jest.fn()}
    />,
  );

  fireEvent.press(screen.getByTestId(`attention-card-${item.id}`));
  expect(onOpen).toHaveBeenCalledWith(item.id);
});

test("views a terminal session when the card body is tapped", () => {
  const onView = jest.fn();
  const item = session("error", 1);

  render(
    <AttentionCard
      session={item}
      onDismiss={jest.fn()}
      onOpen={jest.fn()}
      onView={onView}
    />,
  );

  fireEvent.press(screen.getByTestId(`attention-card-${item.id}`));
  expect(onView).toHaveBeenCalledWith(item.id);
});

test("dismisses only the exact visible attention version", () => {
  const onDismiss = jest.fn();
  const onView = jest.fn();
  const item = session("error", 17);

  render(
    <AttentionCard
      session={item}
      onDismiss={onDismiss}
      onOpen={jest.fn()}
      onView={onView}
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Скрыть уведомление" }));
  expect(onDismiss).toHaveBeenCalledWith(makeDismissalKey(item));
  expect(onView).not.toHaveBeenCalled();
});
