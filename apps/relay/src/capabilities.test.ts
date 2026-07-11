import { describe, expect, it } from "vitest";
import { INTERACTION_STRUCTURED } from "@cucoudle/protocol";
import { negotiateCapabilities } from "./state.js";

describe("negotiateCapabilities", () => {
  it("returns the intersection of mobile, relay and desktop offers", () => {
    expect(
      negotiateCapabilities([INTERACTION_STRUCTURED], [INTERACTION_STRUCTURED]),
    ).toEqual([INTERACTION_STRUCTURED]);
  });

  it("is empty when the desktop does not offer the capability", () => {
    expect(negotiateCapabilities([INTERACTION_STRUCTURED], [])).toEqual([]);
  });

  it("is empty when the mobile does not offer the capability", () => {
    expect(negotiateCapabilities([], [INTERACTION_STRUCTURED])).toEqual([]);
  });

  it("drops capabilities the relay does not support", () => {
    expect(negotiateCapabilities(["file.browse"], ["file.browse"])).toEqual([]);
  });
});
