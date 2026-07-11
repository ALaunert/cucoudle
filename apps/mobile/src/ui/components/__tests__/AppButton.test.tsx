import { render, screen } from "@testing-library/react-native";

import { AppButton } from "../AppButton";

test("exposes a disabled primary button with a named 44-point touch target", () => {
  render(<AppButton label="Продолжить" disabled onPress={jest.fn()} />);

  const button = screen.getByRole("button", { name: "Продолжить" });
  expect(button).toBeDisabled();
  expect(button).toHaveStyle({ minHeight: 44 });
});

test("disables the button and announces progress while loading", () => {
  render(
    <AppButton
      label="Сохранить"
      loading
      loadingLabel="Сохраняем…"
      onPress={jest.fn()}
    />,
  );

  expect(screen.getByRole("button", { name: "Сохраняем…" })).toBeDisabled();
});
