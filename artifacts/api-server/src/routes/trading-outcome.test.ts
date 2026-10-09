import { describe, expect, it } from "vitest";
import { resolveSpotTradeOutcome } from "./trading-outcome";

describe("resolveSpotTradeOutcome", () => {
  it("wins a long only when the real exit price is higher", () => {
    expect(resolveSpotTradeOutcome("long", 100, 101)).toBe("win");
    expect(resolveSpotTradeOutcome("long", 100, 99)).toBe("loss");
  });

  it("wins a short only when the real exit price is lower", () => {
    expect(resolveSpotTradeOutcome("short", 100, 99)).toBe("win");
    expect(resolveSpotTradeOutcome("short", 100, 101)).toBe("loss");
  });

  it("settles a flat price using the established binary direction rule", () => {
    expect(resolveSpotTradeOutcome("long", 100, 100)).toBe("loss");
    expect(resolveSpotTradeOutcome("short", 100, 100)).toBe("win");
  });

  it("rejects invalid entry or exit prices", () => {
    expect(resolveSpotTradeOutcome("long", 0, 100)).toBeNull();
    expect(resolveSpotTradeOutcome("short", 100, Number.NaN)).toBeNull();
  });
});
