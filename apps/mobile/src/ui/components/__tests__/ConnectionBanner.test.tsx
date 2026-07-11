import { render, screen } from "@testing-library/react-native";

import { ConnectionBanner } from "../ConnectionBanner";

test.each([
  ["reconnecting", "Восстанавливаем соединение…"],
  ["offline", "Нет соединения. Изменения сохранятся на устройстве."],
  ["resyncing", "Синхронизируем изменения…"],
  [
    "recovery",
    "Соединение восстановлено. Все изменения синхронизированы.",
  ],
] as const)("renders meaningful visible copy for %s", (status, copy) => {
  render(<ConnectionBanner status={status} />);

  expect(screen.getByText(copy)).toBeVisible();
});

test("communicates offline status with text, not color alone", () => {
  render(<ConnectionBanner status="offline" />);

  expect(screen.getByText("Офлайн")).toBeVisible();
  expect(
    screen.getByText("Нет соединения. Изменения сохранятся на устройстве."),
  ).toBeVisible();
});
