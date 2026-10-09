import { describe, expect, it } from "vitest";
import { parseLiveMarketTick } from "./live-market-feed";
import { timestampedFuturesQuote } from "./futures-quotes";

describe("source-timestamped live trading quotes", () => {
  const now = Date.parse("2026-10-09T08:00:00.000Z");

  it("accepts a supported positive live tick and preserves its source time", () => {
    expect(parseLiveMarketTick({
      asset: "BTC",
      price: 82_000,
      timestamp: new Date(now - 800).toISOString(),
      sources: 8,
      pairs: 3,
    }, now)).toEqual({
      asset: "BTC",
      price: 82_000,
      updatedAt: now - 800,
      sources: 8,
      pairs: 3,
    });
  });

  it("rejects unknown, invalid, future, or stale source ticks", () => {
    const base = { asset: "BTC", price: 100, timestamp: new Date(now - 1000).toISOString() };
    expect(parseLiveMarketTick({ ...base, asset: "NOT_A_TOKEN" }, now)).toBeNull();
    expect(parseLiveMarketTick({ ...base, price: 0 }, now)).toBeNull();
    expect(parseLiveMarketTick({ ...base, timestamp: new Date(now + 10_000).toISOString() }, now)).toBeNull();
    expect(parseLiveMarketTick({ ...base, timestamp: new Date(now - 120_000).toISOString() }, now)).toBeNull();
  });

  it("allows order quotes only while the provider timestamp is fresh", () => {
    expect(timestampedFuturesQuote(100, now - 1000, now)).toEqual({ price: 100, updatedAt: now - 1000 });
    expect(timestampedFuturesQuote(100, now - 20_000, now)).toBeNull();
    expect(timestampedFuturesQuote(100, now + 10_000, now)).toBeNull();
    expect(timestampedFuturesQuote(0, now, now)).toBeNull();
  });
});
