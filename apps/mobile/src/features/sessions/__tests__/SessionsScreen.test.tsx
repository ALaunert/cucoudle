import type { Session } from "@cucoudle/protocol";
import { fireEvent, render, screen } from "@testing-library/react-native";

import {
  createInitialSessionState,
  type SessionState,
} from "../../../state/sessionState";
import { SessionsScreen } from "../SessionsScreen";

function session(
  id: string,
  status: Session["status"],
  lastActivityAt: string,
  cwd = `/work/${id}`,
): Session {
  return {
    id,
    agent: "codex",
    title: `Session ${id}`,
    command: "codex",
    argv: [],
    cwd,
    status,
    createdAt: "2026-07-11T09:00:00.000Z",
    lastActivityAt,
  };
}

function stateWith(...sessions: Session[]): SessionState {
  return {
    ...createInitialSessionState(),
    sessionsById: Object.fromEntries(sessions.map((item) => [item.id, item])),
    sessionIds: sessions.map((item) => item.id),
  };
}

const populatedState = stateWith(
  session("starting", "starting", "2026-07-11T10:01:00.000Z"),
  session("running", "running", "2026-07-11T10:05:00.000Z", "C:\\repo\\mobile-app"),
  session("waiting", "waiting", "2026-07-11T10:03:00.000Z"),
  session("stopped", "stopped", "2026-07-11T10:04:00.000Z"),
  session("error", "error", "2026-07-11T10:02:00.000Z"),
);

function renderScreen(
  overrides: Partial<React.ComponentProps<typeof SessionsScreen>> = {},
) {
  const props: React.ComponentProps<typeof SessionsScreen> = {
    state: populatedState,
    connectionStatus: "online",
    hasLoadedSessionList: true,
    onOpenSession: jest.fn(),
    ...overrides,
  };
  render(<SessionsScreen {...props} />);
  return props;
}

test("pins waiting sessions above newer sessions and derives project labels from Unix and Windows cwd", () => {
  renderScreen();

  const rows = screen.getAllByTestId(/session-row-/);
  expect(rows.map((row) => row.props.testID)).toEqual([
    "session-row-waiting",
    "session-row-running",
    "session-row-stopped",
    "session-row-error",
    "session-row-starting",
  ]);
  expect(screen.getByText("mobile-app")).toBeVisible();
  expect(screen.getByLabelText("Статус: starting")).toBeVisible();
});

test("makes a waiting session visually and accessibly explicit", () => {
  renderScreen();

  expect(screen.getByText("Ждёт вашего ответа")).toBeVisible();
  expect(screen.getByLabelText("Статус: ждёт вашего ответа")).toBeVisible();
  expect(screen.getByTestId("session-row-waiting")).toHaveStyle({
    borderColor: "#DDA94E",
    backgroundColor: "#352A18",
  });
});

test("active filter includes starting, running, and waiting only", () => {
  renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Активные" }));

  expect(screen.getByText("Session starting")).toBeVisible();
  expect(screen.getByText("Session running")).toBeVisible();
  expect(screen.getByText("Session waiting")).toBeVisible();
  expect(screen.queryByText("Session stopped")).toBeNull();
  expect(screen.queryByText("Session error")).toBeNull();
});

test("completed filter includes stopped and error only", () => {
  renderScreen();

  fireEvent.press(screen.getByRole("button", { name: "Завершённые" }));

  expect(screen.getByText("Session stopped")).toBeVisible();
  expect(screen.getByText("Session error")).toBeVisible();
  expect(screen.queryByText("Session starting")).toBeNull();
  expect(screen.queryByText("Session running")).toBeNull();
  expect(screen.queryByText("Session waiting")).toBeNull();
});

test("pressing an accessible row requests its session id for /session/<id> navigation", () => {
  const onOpenSession = jest.fn();
  renderScreen({ onOpenSession });

  fireEvent.press(
    screen.getByRole("button", { name: /Session running.*running/i }),
  );

  expect(onOpenSession).toHaveBeenCalledWith("running");
});

test.each([
  {
    name: "connected computer without sessions",
    connectionStatus: "online" as const,
    hasLoadedSessionList: true,
    title: "Сессий пока нет",
    description: "Запустите CLI-агента на подключённом компьютере.",
  },
  {
    name: "reconnecting computer",
    connectionStatus: "reconnecting" as const,
    hasLoadedSessionList: true,
    title: "Переподключаемся",
    description: "Список сессий появится после восстановления соединения.",
  },
  {
    name: "offline computer",
    connectionStatus: "offline" as const,
    hasLoadedSessionList: true,
    title: "Компьютер офлайн",
    description: "Подключите компьютер к сети, чтобы увидеть сессии.",
  },
  {
    name: "initial session list loading",
    connectionStatus: "online" as const,
    hasLoadedSessionList: false,
    title: "Загружаем сессии",
    description: "Ждём список сессий от подключённого компьютера.",
  },
])("shows a distinct empty state for $name", (scenario) => {
  renderScreen({
    state: createInitialSessionState(),
    connectionStatus: scenario.connectionStatus,
    hasLoadedSessionList: scenario.hasLoadedSessionList,
  });

  expect(screen.getByText(scenario.title)).toBeVisible();
  expect(screen.getByText(scenario.description)).toBeVisible();
});
