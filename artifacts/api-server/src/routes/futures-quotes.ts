import type { Request } from "express";
import type { FuturesQuote } from "./futures";
import {
  ensureLiveMarketFeedStarted,
  getLatestLiveMarketQuote,
  getLiveMarketHistory,
  type LivePricePoint,
} from "./live-market-feed";

const MAX_TRADE_AGE_MS = 15_000;
const QUOTE_CACHE_MS = 2_000;
const PROVIDER_TIMEOUT_MS = 4_000;

type MarketDefinition = { id: string; symbol: string };
type FallbackQuote = (req: Request, asset: string) => Promise<FuturesQuote | null>;

// Exact Kraken public Trades pair names confirmed from /0/public/AssetPairs.
// Tokens without a verified live pair are deliberately left unmapped.
const KRAKEN_PAIR_BY_ID: Record<string, string> = {
  "hyperliquid": "HYPEUSD",
  "crypto-com-chain": "CROUSD",
  "canton-network": "CCUSD",
  "usd1-wlfi": "USD1USD",
  "ethena-usde": "USDEUSD",
  "the-open-network": "TONUSD",
  "paypal-usd": "PYUSDUSD",
  "tether-gold": "XAUTUSD",
  "bittensor": "TAOUSD",
  "near": "NEARUSD",
  "litecoin": "LTCUSD",
  "ripple": "XRPUSD",
  "dogecoin": "DOGEUSD",
  "cardano": "ADAUSD",
  "stellar": "XLMUSD",
  "bitcoin-cash": "BCHUSD",
  "zcash": "ZECUSD",
};

let binanceBlockedUntil = 0;
let coinGeckoAuthBlockedUntil = 0;
let krakenBlockedUntil = 0;

function toFreshQuote(priceValue: unknown, timestampValue: unknown, now = Date.now()): FuturesQuote | null {
  const price = Number(priceValue);
  const updatedAt = Number(timestampValue);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(updatedAt)
    || updatedAt > now + 2_000 || now - updatedAt > MAX_TRADE_AGE_MS) return null;
  const rounded = Number(price.toFixed(8));
  return rounded > 0 ? { price: rounded, updatedAt } : null;
}

// Kept exported for focused unit tests. Quotes must have a positive price and a
// timestamp from the provider, not a locally-generated "now" timestamp.
export function timestampedFuturesQuote(priceValue: unknown, timestampValue: unknown, now = Date.now()): FuturesQuote | null {
  return toFreshQuote(priceValue, timestampValue, now);
}

async function fetchLatestBinanceTrade(
  req: Request,
  pair: string,
): Promise<FuturesQuote | null> {
  if (Date.now() < binanceBlockedUntil) return null;
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/trades?symbol=${encodeURIComponent(pair)}&limit=1`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
    );
    if (response.status === 451) {
      binanceBlockedUntil = Date.now() + 15 * 60_000;
      req.log.warn({ status: response.status }, "Binance trade feed is not available from this region");
      return null;
    }
    if (response.status === 429) {
      binanceBlockedUntil = Date.now() + 60_000;
      req.log.warn({ status: response.status }, "Binance trade feed rate limited; cooling down");
      return null;
    }
    if (!response.ok) return null;
    const trades = await response.json() as Array<{ price?: string; time?: number }>;
    return toFreshQuote(trades[0]?.price, trades[0]?.time);
  } catch (error) {
    req.log.warn({ err: error, pair }, "Binance reference trade unavailable");
    return null;
  }
}

async function fetchLatestKrakenTrade(
  req: Request,
  pair: string,
): Promise<FuturesQuote | null> {
  if (Date.now() < krakenBlockedUntil) return null;
  try {
    const response = await fetch(
      `https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(pair)}`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS) },
    );
    if (response.status === 429) {
      krakenBlockedUntil = Date.now() + 60_000;
      req.log.warn({ status: response.status }, "Kraken reference trades rate limited; cooling down");
      return null;
    }
    if (!response.ok) return null;
    const payload = await response.json() as {
      error?: string[];
      result?: Record<string, Array<[string, string, number]>> & { last?: string };
    };
    if (payload.error?.length) {
      req.log.warn({ providerErrors: payload.error }, "Kraken reference trade returned provider errors");
      return null;
    }
    const rows = Object.entries(payload.result ?? {}).find(([key]) => key !== "last")?.[1];
    const latest = rows?.[rows.length - 1];
    return latest ? toFreshQuote(latest[0], Number(latest[2]) * 1000) : null;
  } catch (error) {
    req.log.warn({ err: error, pair }, "Kraken reference trade unavailable");
    return null;
  }
}

function geckoHeaders(source: Record<string, string>, mode: "demo" | "pro") {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (!["x-cg-demo-api-key", "x-cg-pro-api-key"].includes(name.toLowerCase())) headers[name] = value;
  }
  const demo = Object.entries(source).find(([name]) => name.toLowerCase() === "x-cg-demo-api-key")?.[1];
  const pro = Object.entries(source).find(([name]) => name.toLowerCase() === "x-cg-pro-api-key")?.[1];
  const key = demo ?? pro;
  if (key) headers[mode === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = key;
  headers.accept = "application/json";
  return headers;
}

async function fetchCoinGeckoJson<T>(
  req: Request,
  path: string,
  marketHeaders: Record<string, string>,
): Promise<T | null> {
  if (Date.now() < coinGeckoAuthBlockedUntil) return null;
  const modes = ["demo", "pro"] as const;
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const host = mode === "pro" ? "https://pro-api.coingecko.com/api/v3" : "https://api.coingecko.com/api/v3";
    try {
      const response = await fetch(`${host}/${path}`, {
        headers: geckoHeaders(marketHeaders, mode),
        signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
      });
      if (response.ok) return await response.json() as T;
      if ([400, 401, 403].includes(response.status) && index < modes.length - 1) {
        req.log.warn({ status: response.status, host, mode }, "CoinGecko auth mode rejected; retrying alternate host");
        continue;
      }
      if ([400, 401, 403].includes(response.status)) {
        coinGeckoAuthBlockedUntil = Date.now() + 60_000;
      }
      req.log.warn({ status: response.status, host, mode }, "CoinGecko quote endpoint unavailable");
      return null;
    } catch (error) {
      req.log.warn({ err: error, host }, "CoinGecko endpoint could not be reached");
    }
  }
  return null;
}

export function createFuturesQuoteFetcher(
  definitions: MarketDefinition[],
  binanceSymbols: Record<string, string>,
  marketHeaders: Record<string, string>,
  fallbackQuote?: FallbackQuote,
) {
  const cached = new Map<string, { value: FuturesQuote | null; fetchedAt: number }>();
  const pending = new Map<string, Promise<FuturesQuote | null>>();

  async function fetchQuote(req: Request, asset: string): Promise<FuturesQuote | null> {
    ensureLiveMarketFeedStarted();
    const symbol = asset === "GOLD" ? "XAUT" : asset.toUpperCase();

    // The 1s aggregated SSE feed is the primary source. Read it on every call
    // before checking the slower HTTP cache so charts follow real ticks.
    const streamQuote = getLatestLiveMarketQuote(symbol, MAX_TRADE_AGE_MS);
    if (streamQuote) return streamQuote;

    const definition = definitions.find((item) => item.symbol === symbol);
    if (!definition) return null;

    const binanceSymbol = binanceSymbols[definition.id];
    if (binanceSymbol) {
      const quote = await fetchLatestBinanceTrade(req, binanceSymbol);
      if (quote) return quote;
    }

    const krakenPair = KRAKEN_PAIR_BY_ID[definition.id];
    if (krakenPair) {
      const quote = await fetchLatestKrakenTrade(req, krakenPair);
      if (quote) return quote;
    }

    const gecko = await fetchCoinGeckoJson<Record<string, { usd?: number; last_updated_at?: number }>>(
      req,
      `simple/price?ids=${encodeURIComponent(definition.id)}&vs_currencies=usd&include_last_updated_at=true`,
      marketHeaders,
    );
    const geckoQuote = toFreshQuote(
      gecko?.[definition.id]?.usd,
      Number(gecko?.[definition.id]?.last_updated_at) * 1000,
    );
    if (geckoQuote) return geckoQuote;

    // REST market cache is allowed only when it carries a real, recent source
    // timestamp. A freshly served response is not necessarily a fresh price.
    if (fallbackQuote) {
      try {
        const quote = await fallbackQuote(req, symbol);
        const fresh = quote ? toFreshQuote(quote.price, quote.updatedAt) : null;
        if (fresh) return fresh;
      } catch (error) {
        req.log.warn({ err: error, symbol }, "REST market quote fallback unavailable");
      }
    }
    return null;
  }

  return async (req: Request, asset: string): Promise<FuturesQuote | null> => {
    ensureLiveMarketFeedStarted();
    const symbol = asset === "GOLD" ? "XAUT" : asset.toUpperCase();
    const streamQuote = getLatestLiveMarketQuote(symbol, MAX_TRADE_AGE_MS);
    if (streamQuote) return streamQuote;
    const snapshot = cached.get(symbol);
    if (snapshot && Date.now() - snapshot.fetchedAt < QUOTE_CACHE_MS) {
      return snapshot.value && Date.now() - snapshot.value.updatedAt <= MAX_TRADE_AGE_MS ? snapshot.value : null;
    }
    let request = pending.get(symbol);
    if (!request) {
      request = fetchQuote(req, symbol)
        .then((value) => {
          cached.set(symbol, { value, fetchedAt: Date.now() });
          return value;
        })
        .finally(() => pending.delete(symbol));
      pending.set(symbol, request);
    }
    return request;
  };
}

export function createTradingHistoryFetcher(
  definitions: MarketDefinition[],
  binanceSymbols: Record<string, string>,
  marketHeaders: Record<string, string>,
) {
  return async (req: Request, asset: string): Promise<LivePricePoint[]> => {
    ensureLiveMarketFeedStarted();
    const symbol = asset === "GOLD" ? "XAUT" : asset.toUpperCase();
    const liveHistory = getLiveMarketHistory(symbol, MAX_HISTORY_POINTS_FOR_CHART);
    if (liveHistory.length > 1) return liveHistory;

    const definition = definitions.find((item) => item.symbol === symbol);
    if (!definition) return [];
    const binanceSymbol = binanceSymbols[definition.id];
    if (binanceSymbol) {
      const quote = await fetchHistoricalBinance(req, binanceSymbol);
      if (quote.length) return quote;
    }
    const krakenPair = KRAKEN_PAIR_BY_ID[definition.id];
    if (krakenPair) {
      const candles = await fetchHistoricalKraken(req, krakenPair);
      if (candles.length) return candles;
    }
    const gecko = await fetchCoinGeckoJson<{ prices?: [number, number][] }>(
      req,
      `coins/${encodeURIComponent(definition.id)}/market_chart?vs_currency=usd&days=1`,
      marketHeaders,
    );
    return (gecko?.prices ?? []).slice(-MAX_HISTORY_POINTS_FOR_CHART).flatMap(([t, price]) =>
      Number.isFinite(t) && Number.isFinite(price) && price > 0 && t <= Date.now()
        ? [{ t, price }] : []
    );
  };
}

const MAX_HISTORY_POINTS_FOR_CHART = 180;

async function fetchHistoricalBinance(req: Request, pair: string): Promise<LivePricePoint[]> {
  if (Date.now() < binanceBlockedUntil) return [];
  try {
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair)}&interval=1m&limit=80`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) },
    );
    if (response.status === 451) binanceBlockedUntil = Date.now() + 15 * 60_000;
    else if (response.status === 429) binanceBlockedUntil = Date.now() + 60_000;
    if (!response.ok) return [];
    const candles = await response.json() as Array<[number, string, string, string, string]>;
    return candles.flatMap((candle) => {
      const t = Number(candle[0]), price = Number(candle[4]);
      return Number.isFinite(t) && Number.isFinite(price) && price > 0 && t <= Date.now() ? [{ t, price }] : [];
    });
  } catch (error) {
    req.log.warn({ err: error, pair }, "Trading chart candle history unavailable");
    return [];
  }
}

async function fetchHistoricalKraken(req: Request, pair: string): Promise<LivePricePoint[]> {
  if (Date.now() < krakenBlockedUntil) return [];
  try {
    const response = await fetch(
      `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair)}&interval=1`,
      { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5_000) },
    );
    if (response.status === 429) krakenBlockedUntil = Date.now() + 60_000;
    if (!response.ok) return [];
    const payload = await response.json() as { error?: string[]; result?: Record<string, Array<[number, string, string, string, string]>> & { last?: number } };
    if (payload.error?.length) {
      req.log.warn({ providerErrors: payload.error, pair }, "Kraken chart history returned provider errors");
      return [];
    }
    const rows = Object.entries(payload.result ?? {}).find(([key]) => key !== "last")?.[1] ?? [];
    return rows.flatMap((row) => {
      const t = Number(row[0]) * 1000, price = Number(row[4]);
      return Number.isFinite(t) && Number.isFinite(price) && price > 0 && t <= Date.now() ? [{ t, price }] : [];
    }).slice(-MAX_HISTORY_POINTS_FOR_CHART);
  } catch (error) {
    req.log.warn({ err: error, pair }, "Kraken chart history unavailable");
    return [];
  }
}
