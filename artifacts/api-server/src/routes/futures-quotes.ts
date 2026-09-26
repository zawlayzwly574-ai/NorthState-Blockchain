import type { Request } from "express";
import type { FuturesQuote } from "./futures";

const MAX_TRADE_AGE_MS = 15_000;
const QUOTE_CACHE_MS = 2_000;

// A recently received HTTP response is not proof that the underlying market
// trade is recent. Require a provider-supplied timestamp as well as a price.
export function timestampedFuturesQuote(priceValue: unknown, timestampValue: unknown, now = Date.now()): FuturesQuote | null {
  const price = Number(priceValue);
  const updatedAt = Number(timestampValue);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(updatedAt)
    || updatedAt > now + 2_000 || now - updatedAt > MAX_TRADE_AGE_MS) return null;
  const rounded = Number(price.toFixed(8));
  return rounded > 0 ? { price: rounded, updatedAt } : null;
}

export function createFuturesQuoteFetcher(
  definitions: { id: string; symbol: string }[],
  binanceSymbols: Record<string, string>,
  marketHeaders: Record<string, string>,
) {
  const cached = new Map<string, { value: FuturesQuote | null; fetchedAt: number }>();
  const pending = new Map<string, Promise<FuturesQuote | null>>();

  async function fetchQuote(req: Request, asset: string): Promise<FuturesQuote | null> {
    const symbol = asset === "GOLD" ? "XAUT" : asset;
    const definition = definitions.find((item) => item.symbol === symbol);
    if (!definition) return null;

    const binanceSymbol = binanceSymbols[definition.id];
    if (binanceSymbol) {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/trades?symbol=${encodeURIComponent(binanceSymbol)}&limit=1`,
          { headers: { accept: "application/json" }, signal: AbortSignal.timeout(4000) },
        );
        if (response.ok) {
          const trades = await response.json() as Array<{ price?: string; time?: number }>;
          const quote = timestampedFuturesQuote(trades[0]?.price, trades[0]?.time);
          if (quote) return quote;
        }
      } catch (error) {
        req.log.warn({ err: error, symbol }, "Binance Futures reference trade unavailable");
      }
    }

    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(definition.id)}&vs_currencies=usd&include_last_updated_at=true`,
        { headers: marketHeaders, signal: AbortSignal.timeout(4000) },
      );
      if (!response.ok) return null;
      const prices = await response.json() as Record<string, { usd?: number; last_updated_at?: number }>;
      return timestampedFuturesQuote(prices[definition.id]?.usd, Number(prices[definition.id]?.last_updated_at) * 1000);
    } catch (error) {
      req.log.warn({ err: error, symbol }, "CoinGecko Futures reference quote unavailable");
      return null;
    }
  }

  return async (req: Request, asset: string): Promise<FuturesQuote | null> => {
    const snapshot = cached.get(asset);
    if (snapshot && Date.now() - snapshot.fetchedAt < QUOTE_CACHE_MS) {
      return snapshot.value && Date.now() - snapshot.value.updatedAt <= MAX_TRADE_AGE_MS ? snapshot.value : null;
    }
    let request = pending.get(asset);
    if (!request) {
      request = fetchQuote(req, asset)
        .then((value) => {
          cached.set(asset, { value, fetchedAt: Date.now() });
          return value;
        })
        .finally(() => pending.delete(asset));
      pending.set(asset, request);
    }
    return request;
  };
}

export function createTradingHistoryFetcher(
  definitions: { id: string; symbol: string }[],
  binanceSymbols: Record<string, string>,
  marketHeaders: Record<string, string>,
) {
  return async (req: Request, asset: string): Promise<{ t: number; price: number }[]> => {
    const symbol = asset === "GOLD" ? "XAUT" : asset;
    const definition = definitions.find((item) => item.symbol === symbol);
    if (!definition) return [];
    const binanceSymbol = binanceSymbols[definition.id];
    if (binanceSymbol) {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(binanceSymbol)}&interval=1m&limit=80`,
          { headers: { accept: "application/json" }, signal: AbortSignal.timeout(5000) },
        );
        if (response.ok) {
          const candles = await response.json() as Array<[number, string, string, string, string]>;
          const points = candles.flatMap((candle) => {
            const t = Number(candle[0]);
            const price = Number(candle[4]);
            return Number.isFinite(t) && Number.isFinite(price) && price > 0 && t <= Date.now()
              ? [{ t, price }] : [];
          });
          if (points.length) return points;
        }
      } catch (error) {
        req.log.warn({ err: error, symbol }, "Trading chart candle history unavailable");
      }
    }
    try {
      const response = await fetch(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(definition.id)}/market_chart?vs_currency=usd&days=1`,
        { headers: marketHeaders, signal: AbortSignal.timeout(5000) },
      );
      if (!response.ok) return [];
      const body = await response.json() as { prices?: [number, number][] };
      return (body.prices ?? []).slice(-80).flatMap(([t, price]) =>
        Number.isFinite(t) && Number.isFinite(price) && price > 0 && t <= Date.now()
          ? [{ t, price }] : []
      );
    } catch (error) {
      req.log.warn({ err: error, symbol }, "Trading chart history unavailable");
      return [];
    }
  };
}