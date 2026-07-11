import { fireEvent, render, screen } from "@testing-library/react-native";

import { ConnectionRecoveryScreen } from "../ConnectionRecoveryScreen";

test("explains that the saved desktop or daemon is offline", () => {
  render(
    <ConnectionRecoveryScreen
      onPairAnotherComputer={jest.fn()}
      onRetry={jest.fn()}
    />,
  );

  expect(screen.getByText("Компьютер недоступен")).toBeOnTheScreen();
  expect(screen.getByText(/Cucoudle.*компьютере.*не отвечает/i)).toBeOnTheScreen();
  expect(screen.getByText(/сохранённое подключение останется/i)).toBeOnTheScreen();
});

test("retry delegates without invoking replacement pairing", () => {
  const onRetry = jest.fn();
  const onPairAnotherComputer = jest.fn();
  render(
    <ConnectionRecoveryScreen
      onPairAnotherComputer={onPairAnotherComputer}
      onRetry={onRetry}
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Повторить" }));

  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onPairAnotherComputer).not.toHaveBeenCalled();
});

test("pair another computer delegates replacement navigation", () => {
  const onPairAnotherComputer = jest.fn();
  render(
    <ConnectionRecoveryScreen
      onPairAnotherComputer={onPairAnotherComputer}
      onRetry={jest.fn()}
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Подключить другой компьютер" }));

  expect(onPairAnotherComputer).toHaveBeenCalledTimes(1);
});
