import { render, screen } from "@testing-library/react-native";
import { BrandMark } from "../BrandMark";

test("renders the Cucoudle product name", () => {
  render(<BrandMark />);
  expect(screen.getByText("Cucoudle")).toBeOnTheScreen();
});
