import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { InteractionRequest } from "@cucoudle/protocol";
import { StructuredActionZone } from "../StructuredActionZone";

const interaction: InteractionRequest = {
  id: "interaction-1",
  sessionId: "session-1",
  kind: "approval",
  prompt: "Разрешить команду?",
  options: [
    { id: "deny-option", label: "Нет", intent: "reject" },
    { id: "allow-once-option", label: "Да", intent: "approveOnce" },
  ],
  allowsText: false,
  allowsTerminalInput: true,
  createdAt: "2026-07-11T12:00:00.000Z",
};

test("renders only the safe open-session fallback without negotiated capability", () => {
  const onOpen = jest.fn();
  render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set()}
      onOpenSession={onOpen}
      onRespond={jest.fn()}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Открыть сессию" }));
  expect(onOpen).toHaveBeenCalledWith("session-1");
  expect(screen.queryByText("Разрешить")).not.toBeOnTheScreen();
  expect(screen.queryByText("Отклонить")).not.toBeOnTheScreen();
});

test("uses option intents and disables both actions while one response is pending", async () => {
  let resolve!: () => void;
  const onRespond = jest.fn(
    () => new Promise<void>((done) => {
      resolve = done;
    }),
  );
  render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Разрешить" }));

  expect(onRespond).toHaveBeenCalledTimes(1);
  expect(onRespond).toHaveBeenCalledWith({
    sessionId: "session-1",
    interactionId: "interaction-1",
    response: { type: "options", optionIds: ["allow-once-option"] },
  });
  expect(screen.getByRole("button", { name: "Отклонить" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Отправка…" })).toBeDisabled();

  resolve();
  await waitFor(() => expect(screen.getByText(/ждём подтверждения/i)).toBeVisible());
  expect(onRespond).toHaveBeenCalledTimes(1);
});

test("sends the reject option selected by intent", async () => {
  const onRespond = jest.fn().mockResolvedValue(undefined);
  render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Отклонить" }));
  await waitFor(() => expect(onRespond).toHaveBeenCalledTimes(1));
  expect(onRespond).toHaveBeenCalledWith(
    expect.objectContaining({ response: { type: "options", optionIds: ["deny-option"] } }),
  );
});

test("shows a failure without automatically resending", async () => {
  const onRespond = jest.fn().mockRejectedValue(new Error("connection lost"));
  render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Разрешить" }));
  expect(await screen.findByText("connection lost")).toBeVisible();
  expect(onRespond).toHaveBeenCalledTimes(1);
});

test("falls back for unsupported structured interaction shapes", () => {
  render(
    <StructuredActionZone
      canMutate
      interaction={{ ...interaction, kind: "text", options: undefined, allowsText: true }}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={jest.fn()}
      sessionId="session-1"
    />,
  );

  expect(screen.getByRole("button", { name: "Открыть сессию" })).toBeVisible();
  expect(screen.queryByText("Разрешить")).not.toBeOnTheScreen();
});

test("lets a fresh resubscribe snapshot decide that the same interaction is still unresolved", async () => {
  const onRespond = jest.fn().mockResolvedValue(undefined);
  const view = render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Разрешить" }));
  await screen.findByText(/ждём подтверждения/i);
  expect(screen.getByRole("button", { name: "Разрешить" })).toBeDisabled();

  view.rerender(
    <StructuredActionZone
      canMutate
      interaction={{ ...interaction, prompt: "Всё ещё ждёт ответа" }}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Разрешить" })).toBeEnabled(),
  );
  expect(onRespond).toHaveBeenCalledTimes(1);
});

test("keeps structured controls visible but disabled while offline", () => {
  render(
    <StructuredActionZone
      canMutate={false}
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={jest.fn()}
      sessionId="session-1"
    />,
  );

  expect(screen.getByRole("button", { name: "Разрешить" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Отклонить" })).toBeDisabled();
});

test("does not allow a second response after an ambiguous failure before resubscribe", async () => {
  const onRespond = jest.fn().mockRejectedValue(new Error("connection lost"));
  render(
    <StructuredActionZone
      canMutate
      interaction={interaction}
      negotiatedCapabilities={new Set(["interaction.structured"])}
      onOpenSession={jest.fn()}
      onRespond={onRespond}
      sessionId="session-1"
    />,
  );

  fireEvent.press(screen.getByRole("button", { name: "Разрешить" }));
  await screen.findByText("connection lost");
  fireEvent.press(screen.getByRole("button", { name: "Разрешить" }));

  expect(onRespond).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Разрешить" })).toBeDisabled();
});
