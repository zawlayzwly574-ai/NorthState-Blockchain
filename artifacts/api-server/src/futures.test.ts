import { describe, expect, it } from "vitest";
import type { FuturesPosition } from "@workspace/db";
import { OpenFuturesPositionBody } from "@workspace/api-zod";
import { positionPnl } from "./routes/futures";
import { timestampedFuturesQuote } from "./routes/futures-quotes";

const base = {
  margin: "1000.00000000",
  leverage: 20,
  entryPrice: "50000.00000000",
  direction: "long",
} as FuturesPosition;

describe("isolated Futures PnL", () => {
  it("credits a 20x long for a 1% rise and a short for a 1% fall", () => {
    expect(positionPnl(base, 50500)).toBe(200);
    expect(positionPnl({ ...base, direction: "short" }, 49500)).toBe(200);
  });

  it("never loses more than reserved margin for either direction", () => {
    expect(positionPnl(base, 45000)).toBe(-1000);
    expect(positionPnl({ ...base, direction: "short" }, 55000)).toBe(-1000);
  });

  it("rejects unsupported collateral and contract choices", () => {
    const input = {
      asset: "BTC", direction: "long", margin: "1000",
      leverage: 50, settlement: "USDT", contractType: "Perpetual",
    };
    expect(OpenFuturesPositionBody.safeParse(input).success).toBe(true);
    expect(OpenFuturesPositionBody.safeParse({ ...input, settlement: "USDC" }).success).toBe(false);
    expect(OpenFuturesPositionBody.safeParse({ ...input, contractType: "Quarterly" }).success).toBe(false);
  });

  it("rejects old provider trades even if the HTTP response was received just now", () => {
    const now = 1_790_389_800_000;
    expect(timestampedFuturesQuote("84029.77", now - 4_000, now)).toEqual({
      price: 84029.77, updatedAt: now - 4_000,
    });
    expect(timestampedFuturesQuote("84029.77", now - 60_000, now)).toBeNull();
    expect(timestampedFuturesQuote("84029.77", now + 60_000, now)).toBeNull();
    expect(timestampedFuturesQuote("0", now - 4_000, now)).toBeNull();
    expect(timestampedFuturesQuote("garbage", now - 4_000, now)).toBeNull();
  });
});