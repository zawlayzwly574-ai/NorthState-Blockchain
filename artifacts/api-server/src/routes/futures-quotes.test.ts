import { describe, expect, it } from "vitest";
import {
  parseBitfinexMidpoint,
  parseGateTradeQuote,
  parseMexcTradeQuote,
} from "./futures-quotes";

describe("timestamped exchange quote parsers", () => {
  const now = Date.parse("2026-10-09T08:00:00.000Z");

  it("accepts recent Gate.io FDUSD trades with millisecond timestamps", () => {
    expect(parseGateTradeQuote({
      price: "0.9981",
      create_time_ms: String(now - 250),
      create_time: String(Math.floor((now - 250) / 1000)),
    }, now)).toEqual({ price: 0.9981, updatedAt: now - 250 });
  });

  it("accepts recent MEXC trades and rejects stale trades", () => {
    expect(parseMexcTradeQuote({ price: "0.9982", time: now - 100 }, now))
      .toEqual({ price: 0.9982, updatedAt: now - 100 });
    expect(parseMexcTradeQuote({ price: "0.9982", time: now - 30_000 }, now)).toBeNull();
    expect(parseMexcTradeQuote({ price: "0", time: now }, now)).toBeNull();
  });

  it("uses an observed Bitfinex bid/ask midpoint only for valid books", () => {
    expect(parseBitfinexMidpoint([8.88, 100, 8.90, 90], now))
      .toEqual({ price: 8.89, updatedAt: now });
    expect(parseBitfinexMidpoint([0, 100, 8.90, 90], now)).toBeNull();
    expect(parseBitfinexMidpoint([9, 100, 8.90, 90], now)).toBeNull();
  });
});
