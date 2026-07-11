import { fireEvent, render, screen } from "@testing-library/react-native";
import { Alert } from "react-native";

import { NewScreen } from "../NewScreen";

afterEach(() => {
  jest.restoreAllMocks();
});

test("starts pairing directly when no computer is active", () => {
  const onPairComputer = jest.fn();
  render(<NewScreen activeComputer={null} onPairComputer={onPairComputer} />);

  fireEvent.press(screen.getByRole("button", { name: "Подключить компьютер" }));

  expect(onPairComputer).toHaveBeenCalledTimes(1);
});

test("does not replace the active computer when confirmation is cancelled", () => {
  const onPairComputer = jest.fn();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  render(
    <NewScreen
      activeComputer={{ id: "desktop-1", name: "MacBook Алексея" }}
      onPairComputer={onPairComputer}
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Подключить компьютер" }));
  const buttons = alert.mock.calls[0]?.[2];
  buttons?.find((button) => button.text === "Отмена")?.onPress?.();

  expect(onPairComputer).not.toHaveBeenCalled();
});

test("replaces the active computer only after explicit confirmation", () => {
  const onPairComputer = jest.fn();
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  render(
    <NewScreen
      activeComputer={{ id: "desktop-1", name: "MacBook Алексея" }}
      onPairComputer={onPairComputer}
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Подключить компьютер" }));
  expect(alert).toHaveBeenCalledWith(
    "Заменить подключённый компьютер?",
    expect.stringContaining("MacBook Алексея"),
    expect.any(Array),
  );
  const buttons = alert.mock.calls[0]?.[2];
  buttons?.find((button) => button.text === "Заменить")?.onPress?.();

  expect(onPairComputer).toHaveBeenCalledTimes(1);
});

test("shows session launch as planned and disabled because the launch contract is absent", () => {
  render(<NewScreen activeComputer={null} onPairComputer={jest.fn()} />);

  expect(screen.getByText(/desktop launch contract ещё не реализован/i)).toBeVisible();
  expect(screen.getByRole("button", { name: "Запустить сессию" })).toBeDisabled();
});
