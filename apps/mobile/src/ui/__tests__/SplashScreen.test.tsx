import { render, screen } from "@testing-library/react-native";

import { SplashScreen } from "../SplashScreen";

test("renders the approved Cucoudle launch composition", () => {
  render(<SplashScreen />);

  expect(screen.getByTestId("splash-artwork")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Cucoudle" })).toBeOnTheScreen();
  expect(screen.getByText("AI CODING AGENTS · ONE CHAT")).toBeOnTheScreen();
  expect(
    screen.getByRole("progressbar", { name: "Загрузка приложения" }),
  ).toBeOnTheScreen();
});
