import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { SessionComposer } from "../SessionComposer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderComposer(
  overrides: Partial<React.ComponentProps<typeof SessionComposer>> = {},
) {
  const props: React.ComponentProps<typeof SessionComposer> = {
    sessionId: "session-1",
    disabled: false,
    onSendInput: jest.fn().mockResolvedValue({ accepted: true }),
    ...overrides,
  };
  render(<SessionComposer {...props} />);
  return props;
}

test("sends submitted text input and clears only after success", async () => {
  const send = deferred<{ accepted: boolean }>();
  const onSendInput = jest.fn(() => send.promise);
  renderComposer({ onSendInput });

  const input = screen.getByLabelText("Команда");
  fireEvent.changeText(input, "npm test");
  fireEvent.press(screen.getByRole("button", { name: "Отправить" }));

  expect(onSendInput).toHaveBeenCalledTimes(1);
  expect(onSendInput).toHaveBeenCalledWith({
    sessionId: "session-1",
    inputMode: "text",
    data: "npm test",
    submit: true,
  });
  expect(input.props.value).toBe("npm test");
  expect(screen.getByRole("button", { name: "Отправка…" })).toBeDisabled();

  send.resolve({ accepted: true });
  await waitFor(() => expect(input.props.value).toBe(""));
  expect(onSendInput).toHaveBeenCalledTimes(1);
});

test("retains the draft after an error and never retries automatically", async () => {
  const onSendInput = jest.fn().mockRejectedValue(new Error("relay rejected input"));
  renderComposer({ onSendInput });

  const input = screen.getByLabelText("Команда");
  fireEvent.changeText(input, "keep me");
  fireEvent.press(screen.getByRole("button", { name: "Отправить" }));

  await screen.findByText("relay rejected input");
  expect(input.props.value).toBe("keep me");
  expect(onSendInput).toHaveBeenCalledTimes(1);
});

test.each([
  ["offline", true],
  ["stopped", true],
  ["available", false],
] as const)("is disabled when controls are %s", (_name, disabled) => {
  renderComposer({ disabled });

  if (disabled) expect(screen.getByLabelText("Команда")).toBeDisabled();
  else expect(screen.getByLabelText("Команда")).toBeEnabled();
  expect(screen.getByRole("button", { name: "Отправить" })).toBeDisabled();
});

test("does not send an empty draft", () => {
  const onSendInput = jest.fn();
  renderComposer({ onSendInput });

  fireEvent.press(screen.getByRole("button", { name: "Отправить" }));

  expect(onSendInput).not.toHaveBeenCalled();
});
