import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { FuturesPosition } from "@workspace/db";
import { OpenFuturesPositionBody } from "@workspace/api-zod";
import { positionPnl } from "./routes/futures";
import {
  createFuturesQuoteFetcher,
  createTradingHistoryFetcher,
  timestampedFuturesQuote,
} from "./routes/futures-quotes";

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

  it("uses a fresh Coinbase USD ticker when Binance and CoinGecko are unavailable", async () => {
    const now = Date.now();
    const fetchQuote = createFuturesQuoteFetcher(
      [{ id: "bitcoin", symbol: "BTC" }],
      { bitcoin: "BTCUSDT" },
      {},
    );
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("api.binance.com")) return new Response(null, { status: 451 });
      if (url.includes("api.exchange.coinbase.com")) {
        return Response.json({ price: "84000.25", time: new Date(now - 1_000).toISOString() });
      }
      return new Response(null, { status: 429 });
    });

    try {
      const quote = await fetchQuote({ log: { warn: vi.fn() } } as never, "BTC");
      expect(quote).toEqual({ price: 84000.25, updatedAt: expect.any(Number) });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not use a stale Coinbase ticker as a Futures quote", async () => {
    const fetchQuote = createFuturesQuoteFetcher(
      [{ id: "bitcoin", symbol: "BTC" }],
      { bitcoin: "BTCUSDT" },
      {},
    );
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("api.exchange.coinbase.com")) {
        return Response.json({ price: "84000.25", time: new Date(Date.now() - 60_000).toISOString() });
      }
      return new Response(null, { status: 451 });
    });

    try {
      const quote = await fetchQuote({ log: { warn: vi.fn() } } as never, "BTC");
      expect(quote).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses ordered Coinbase candles when Binance and CoinGecko history are unavailable", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const fetchHistory = createTradingHistoryFetcher(
      [{ id: "bitcoin", symbol: "BTC" }],
      { bitcoin: "BTCUSDT" },
      {},
    );
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("api.binance.com")) return new Response(null, { status: 451 });
      if (url.includes("api.exchange.coinbase.com")) {
        return Response.json([
          [nowSeconds, "84000", "84100", "84050", "84080", "10"],
          [nowSeconds - 60, "83900", "84000", "83950", "83990", "8"],
          [nowSeconds + 60, "84100", "84200", "84150", "84180", "5"],
        ]);
      }
      return new Response(null, { status: 429 });
    });

    try {
      const history = await fetchHistory({ log: { warn: vi.fn() } } as never, "BTC");
      expect(history).toEqual([
        { t: (nowSeconds - 60) * 1000, price: 83990 },
        { t: nowSeconds * 1000, price: 84080 },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});