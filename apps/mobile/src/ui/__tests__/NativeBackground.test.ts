import appConfig from "../../../app.json";

import { rootStackScreenOptions } from "../../app/_layout";
import { colors } from "../theme";

test("keeps the native window and root navigator dark behind rounded system UI", () => {
  expect(appConfig.expo.backgroundColor).toBe(colors.background);
  expect(rootStackScreenOptions.contentStyle.backgroundColor).toBe(colors.background);
});
