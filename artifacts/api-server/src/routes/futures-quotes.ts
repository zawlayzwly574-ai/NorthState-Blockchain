import type { Request } from "express";
import type { FuturesQuote } from "./futures";

const MAX_TRADE_AGE_MS = 15_000;
const QUOTE_CACHE_MS = 750;
const MARKET_SNAPSHOT_CACHE_MS = 850;
const MARKET_HISTORY_LIMIT = 80;
const PROVIDER_TIMEOUT_MS = 2_500;

type AssetDefinition = { id: string; symbol: string; name?: string };
type MarketQuote = {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  updatedAt?: number;
};
type MarketSnapshot = Record<string, MarketQuote>;
type ApiResult = { response: Response; body: any };
type ProviderTrade = { price: unknown; timestamp: unknown };

const providerCooldowns = new Map<string, number>();
const unsupportedPairs = new Map<string, number>();

// Real exchange product names differ from our app symbols. The aliases here
// only identify the exchange's product; we still read the trade timestamp from
// that exchange before allowing execution.
const COINBASE_PRODUCTS: Record<string, string> = {
  BTC: "BTC-USD", ETH: "ETH-USD", USDT: "USDT-USD", USDC: "USDC-USD",
  XRP: "XRP-USD", SOL: "SOL-USD", TRX: "TRX-USD", DOGE: "DOGE-USD",
  LINK: "LINK-USD", ADA: "ADA-USD", XLM: "XLM-USD", BCH: "BCH-USD",
  LTC: "LTC-USD", AVAX: "AVAX-USD", SHIB: "SHIB-USD", UNI: "UNI-USD",
  NEAR: "NEAR-USD", HBAR: "HBAR-USD", ZEC: "ZEC-USD",
};
const KRAKEN_PAIRS: Record<string, string> = {
  BTC: "XBTUSD", ETH: "ETHUSD", USDT: "USDTUSD", USDC: "USDCUSD",
  XRP: "XRPUSD", SOL: "SOLUSD", TRX: "TRXUSD", DOGE: "XDGUSD",
  LINK: "LINKUSD", ADA: "ADAUSD", XLM: "XLMUSD", BCH: "BCHUSD",
  LTC: "LTCUSD", AVAX: "AVAXUSD", HBAR: "HBARUSD", TON: "TONUSD",
  XAUT: "XAUTUSD", UNI: "UNIUSD", NEAR: "NEARUSD", ZEC: "ZECUSD",
  XMR: "XMRUSD",
};

function aliasesFor(symbolValue: string): string[] {
  const symbol = symbolValue.toUpperCase() === "GOLD" ? "XAUT" : symbolValue.toUpperCase();
  // Do not use CoinPaprika's alternate symbols (CANTON -> CC, TON -> GRAM)
  // against exchange trade endpoints: exchange tickers contain no token ID and
  // both symbols are ambiguous across unrelated assets. Public display metadata
  // uses the provider's explicit asset ID separately.
  return [symbol];
}

function okxPairs(symbol: string): string[] {
  return aliasesFor(symbol).flatMap((alias) => [alias + "-USDT", alias + "-USDC", alias + "-USD"]);
}
function gatePairs(symbol: string): string[] {
  return aliasesFor(symbol).flatMap((alias) => [alias + "_USDT", alias + "_USDC", alias + "_USD"]);
}
function bybitPairs(symbol: string): string[] {
  return aliasesFor(symbol).flatMap((alias) => [alias + "USDT", alias + "USDC", alias + "USD"]);
}
function kucoinPairs(symbol: string): string[] {
  return aliasesFor(symbol).flatMap((alias) => [alias + "-USDT", alias + "-USDC", alias + "-USD"]);
}
function mexcPairs(symbol: string): string[] {
  return aliasesFor(symbol).flatMap((alias) => [alias + "USDT", alias + "USDC", alias + "USD"]);
}

function providerIsCoolingDown(provider: string): boolean {
  return (providerCooldowns.get(provider) ?? 0) > Date.now();
}
function pairIsUnsupported(provider: string, pair: string): boolean {
  return (unsupportedPairs.get(provider + ":" + pair) ?? 0) > Date.now();
}
function blockPair(provider: string, pair: string, duration = 10 * 60_000) {
  unsupportedPairs.set(provider + ":" + pair, Date.now() + duration);
}
function updateProviderCooldown(provider: string, status: number) {
  if (status === 451 || status === 403) providerCooldowns.set(provider, Date.now() + 15 * 60_000);
  else if (status === 429) providerCooldowns.set(provider, Date.now() + 60_000);
  else if (status === 401) providerCooldowns.set(provider, Date.now() + 60_000);
}

async function fetchJson(req: Request, provider: string, url: string): Promise<ApiResult | null> {
  if (providerIsCoolingDown(provider)) return null;
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "NorthStateBlockchain/1.0" },
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      updateProviderCooldown(provider, response.status);
      if (response.status === 400 || response.status === 404 || response.status === 451) {
        req.log.debug({ provider, status: response.status }, "Market source is unavailable for this deployment region or product");
      }
      return { response, body };
    }
    return { response, body };
  } catch (error) {
    req.log.debug({ provider, err: error }, "Market source request failed");
    return null;
  }
}

function validTrade(priceValue: unknown, timestampValue: unknown, now = Date.now()): FuturesQuote | null {
  const price = Number(priceValue);
  const updatedAt = Number(timestampValue);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(updatedAt)
    || updatedAt <= 0 || updatedAt > now + 2_000 || now - updatedAt > MAX_TRADE_AGE_MS) {
    return null;
  }
  const rounded = Number(price.toFixed(8));
  return rounded > 0 ? { price: rounded, updatedAt } : null;
}

// Exported for direct unit testing and to keep all execution paths on the same
// provider-time freshness rule. Local response time is never substituted.
export function timestampedFuturesQuote(priceValue: unknown, timestampValue: unknown, now = Date.now()): FuturesQuote | null {
  return validTrade(priceValue, timestampValue, now);
}

async function fetchOkxTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const provider = "okx";
  for (const pair of okxPairs(symbol)) {
    if (pairIsUnsupported(provider, pair)) continue;
    const result = await fetchJson(req, provider,
      "https://www.okx.com/api/v5/market/trades?instId=" + encodeURIComponent(pair) + "&limit=1");
    if (!result) return null;
    const code = String(result.body?.code ?? "");
    const trades = result.body?.data;
    if (!result.response.ok || code !== "0" || !Array.isArray(trades) || !trades.length) {
      blockPair(provider, pair);
      continue;
    }
    const newest = trades.reduce((best: any, row: any) =>
      !best || Number(row.ts) > Number(best.ts) ? row : best, null);
    const quote = validTrade(newest?.px, newest?.ts);
    if (quote) return quote;
  }
  return null;
}

async function fetchGateTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const provider = "gate";
  for (const pair of gatePairs(symbol)) {
    if (pairIsUnsupported(provider, pair)) continue;
    const result = await fetchJson(req, provider,
      "https://api.gateio.ws/api/v4/spot/trades?currency_pair=" + encodeURIComponent(pair) + "&limit=1");
    if (!result) return null;
    if (!result.response.ok || !Array.isArray(result.body) || !result.body.length) {
      blockPair(provider, pair);
      continue;
    }
    const newest = result.body.reduce((best: any, row: any) => {
      const time = gateTradeTime(row.create_time_ms ?? row.create_time);
      return !best || time > gateTradeTime(best.create_time_ms ?? best.create_time) ? row : best;
    }, null);
    const timestamp = gateTradeTime(newest?.create_time_ms ?? newest?.create_time);
    const quote = validTrade(newest?.price, timestamp);
    if (quote) return quote;
  }
  return null;
}

async function fetchBybitTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const provider = "bybit";
  for (const pair of bybitPairs(symbol)) {
    if (pairIsUnsupported(provider, pair)) continue;
    const result = await fetchJson(req, provider,
      "https://api.bybit.com/v5/market/recent-trade?category=spot&symbol=" + encodeURIComponent(pair) + "&limit=1");
    if (!result) return null;
    const trades = result.body?.result?.list;
    if (!result.response.ok || Number(result.body?.retCode ?? 0) !== 0 || !Array.isArray(trades) || !trades.length) {
      blockPair(provider, pair);
      continue;
    }
    const newest = trades.reduce((best: any, row: any) =>
      !best || Number(row.time) > Number(best.time) ? row : best, null);
    const quote = validTrade(newest?.price, newest?.time);
    if (quote) return quote;
  }
  return null;
}

function kucoinTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e17) return n / 1_000_000; // KuCoin trade-history timestamps are nanoseconds -> milliseconds
  if (n > 1e14) return n / 1000; // microseconds -> milliseconds
  if (n < 1e11) return n * 1000; // seconds -> milliseconds
  return n;
}

function gateTradeTime(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  // Gate's spot-trades endpoint returns create_time in milliseconds with a
  // fractional part on current payloads, although older examples use seconds.
  return n >= 1e12 ? n : n * 1000;
}

function exchangeSymbolForAsset(definition: AssetDefinition): string {
  if (definition.id === "tether-gold") return "XAUT";
  if (definition.id === "canton-network") return "CC";
  if (definition.id === "the-open-network") return "GRAM";
  return definition.symbol.toUpperCase() === "GOLD" ? "XAUT" : definition.symbol.toUpperCase();
}

async function fetchKucoinTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const provider = "kucoin";
  for (const pair of kucoinPairs(symbol)) {
    if (pairIsUnsupported(provider, pair)) continue;
    const result = await fetchJson(req, provider,
      "https://api.kucoin.com/api/v1/market/histories?symbol=" + encodeURIComponent(pair));
    if (!result) return null;
    const trades = result.body?.data;
    if (!result.response.ok || Number(result.body?.code ?? "200000") !== 200000 || !Array.isArray(trades) || !trades.length) {
      blockPair(provider, pair);
      continue;
    }
    const newest = trades.reduce((best: any, row: any) =>
      !best || kucoinTime(row.time) > kucoinTime(best.time) ? row : best, null);
    const quote = validTrade(newest?.price, kucoinTime(newest?.time));
    if (quote) return quote;
  }
  return null;
}

async function fetchCoinbaseTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const product = COINBASE_PRODUCTS[symbol];
  if (!product || pairIsUnsupported("coinbase", product)) return null;
  const result = await fetchJson(req, "coinbase",
    "https://api.exchange.coinbase.com/products/" + encodeURIComponent(product) + "/trades?limit=10");
  if (!result) return null;
  if (!result.response.ok || !Array.isArray(result.body) || !result.body.length) {
    blockPair("coinbase", product);
    return null;
  }
  const newest = result.body.reduce((best: any, row: any) =>
    !best || Date.parse(row.time) > Date.parse(best.time) ? row : best, null);
  const quote = validTrade(newest?.price, Date.parse(newest?.time));
  return quote;
}

async function fetchKrakenTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const pair = KRAKEN_PAIRS[symbol];
  if (!pair || pairIsUnsupported("kraken", pair)) return null;
  const result = await fetchJson(req, "kraken",
    "https://api.kraken.com/0/public/Trades?pair=" + encodeURIComponent(pair));
  if (!result) return null;
  if (!result.response.ok || !result.body?.result || (result.body?.error?.length ?? 0) > 0) {
    blockPair("kraken", pair);
    return null;
  }
  const rows = Object.entries(result.body.result)
    .filter(([key, value]) => key !== "last" && Array.isArray(value))
    .flatMap(([, value]) => value as any[]);
  if (!rows.length) {
    blockPair("kraken", pair);
    return null;
  }
  const newest = rows.reduce((best: any, row: any) =>
    !best || Number(row[2]) > Number(best[2]) ? row : best, null);
  return validTrade(newest?.[0], Number(newest?.[2]) * 1000);
}

async function fetchMexcTrade(req: Request, symbol: string): Promise<FuturesQuote | null> {
  const provider = "mexc";
  for (const alias of aliasesFor(symbol)) {
    for (const pair of [alias + "USDT", alias + "USDC", alias + "USD"]) {
      if (pairIsUnsupported(provider, pair)) continue;
      const result = await fetchJson(req, provider,
        "https://api.mexc.com/api/v3/trades?symbol=" + encodeURIComponent(pair) + "&limit=10");
      if (!result) return null;
      if (!result.response.ok || !Array.isArray(result.body) || !result.body.length) {
        blockPair(provider, pair);
        continue;
      }
      const newest = result.body.reduce((best: any, row: any) =>
        !best || Number(row.time) > Number(best.time) ? row : best, null);
      const quote = validTrade(newest?.price, newest?.time);
      if (quote) return quote;
    }
  }
  return null;
}

async function fetchBinanceTrade(
  req: Request,
  definition: AssetDefinition,
  binanceSymbols: Record<string, string>,
): Promise<FuturesQuote | null> {
  const provider = "binance";
  const symbol = binanceSymbols[definition.id];
  if (!symbol || providerIsCoolingDown(provider)) return null;
  const result = await fetchJson(req, provider,
    "https://api.binance.com/api/v3/trades?symbol=" + encodeURIComponent(symbol) + "&limit=1");
  if (!result) return null;
  if (!result.response.ok || !Array.isArray(result.body) || !result.body.length) {
    updateProviderCooldown(provider, result.response.status);
    if (result.response.status !== 429 && result.response.status !== 451) blockPair(provider, symbol);
    return null;
  }
  const trade = result.body.reduce((best: any, row: any) =>
    !best || Number(row.time) > Number(best.time) ? row : best, null);
  return validTrade(trade?.price, trade?.time);
}

async function fetchLiveQuote(
  req: Request,
  definition: AssetDefinition,
  binanceSymbols: Record<string, string>,
): Promise<FuturesQuote | null> {
  const symbol = exchangeSymbolForAsset(definition);
  // Provider order puts exchanges known to be reachable in this deployment
  // first. Each quote must contain its own recent trade timestamp. Provider
  // symbols are based on the supported asset ID, not just the UI ticker:
  // Canton trades as CC and the Toncoin market is currently listed as GRAM.
  // For provider-specific tickers, use only exchanges where we verified the
  // identity-matched pair. "CC" and "GRAM" can identify unrelated tokens on
  // some venues, so don't fall through to ambiguous pairs if the trusted
  // Canton/Toncoin market is temporarily unavailable.
  const hasProviderSpecificSymbol = definition.id === "canton-network" || definition.id === "the-open-network";
  const providers: Array<() => Promise<FuturesQuote | null>> = hasProviderSpecificSymbol
    ? [
        () => fetchOkxTrade(req, symbol),
        () => fetchGateTrade(req, symbol),
        () => fetchKucoinTrade(req, symbol),
      ]
    : [
        () => fetchOkxTrade(req, symbol),
        () => fetchGateTrade(req, symbol),
        () => fetchCoinbaseTrade(req, symbol),
        () => fetchMexcTrade(req, symbol),
        () => fetchKucoinTrade(req, symbol),
        () => fetchKrakenTrade(req, symbol),
        () => fetchBybitTrade(req, symbol),
        () => fetchBinanceTrade(req, definition, binanceSymbols),
      ];
  for (const provider of providers) {
    const quote = await provider().catch((error) => {
      req.log.debug({ err: error, symbol }, "Live quote provider failed");
      return null;
    });
    if (quote && Date.now() - quote.updatedAt >= -2_000 && Date.now() - quote.updatedAt <= MAX_TRADE_AGE_MS) {
      return quote;
    }
  }
  req.log.warn({ symbol }, "No fresh provider-timestamped market trade is available");
  return null;
}

function providerSymbolMatch(definition: AssetDefinition, rawSymbol: string): boolean {
  return exchangeSymbolForAsset(definition) === rawSymbol.toUpperCase();
}
function chooseSnapshotPair(candidates: any[]): any | null {
  const valid = candidates.filter((row) =>
    Number.isFinite(Number(row.price)) && Number(row.price) > 0 &&
    ["USDT", "USDC", "USD"].includes(String(row.quote).toUpperCase()));
  valid.sort((a, b) => {
    const rank = (quote: string) => quote.toUpperCase() === "USDT" ? 0 : quote.toUpperCase() === "USDC" ? 1 : 2;
    return rank(a.quote) - rank(b.quote) || Number(b.updatedAt ?? 0) - Number(a.updatedAt ?? 0);
  });
  return valid[0] ?? null;
}

let marketSnapshotCache: { data: MarketSnapshot; fetchedAt: number } | null = null;
let marketSnapshotPending: Promise<MarketSnapshot> | null = null;
let kucoinSnapshotCache: { rows: any[]; sourceAt: number; fetchedAt: number } | null = null;
let kucoinSnapshotRetryAfter = 0;

// Bulk exchange snapshots make the Markets and Trading selectors update quickly
// without one upstream request per coin. These values are for display only;
// executable positions use fetchLiveQuote() and its actual recent trade time.
export function createMarketSnapshotFetcher(definitions: AssetDefinition[]) {
  return async (req: Request): Promise<MarketSnapshot> => {
    const now = Date.now();
    if (marketSnapshotCache && now - marketSnapshotCache.fetchedAt < MARKET_SNAPSHOT_CACHE_MS) {
      return marketSnapshotCache.data;
    }
    if (marketSnapshotPending) return marketSnapshotPending;
    marketSnapshotPending = (async () => {
      const data: MarketSnapshot = {};
      const okxResult = await fetchJson(req, "okx-snapshot", "https://www.okx.com/api/v5/market/tickers?instType=SPOT");
      if (okxResult?.response.ok && String(okxResult.body?.code ?? "") === "0" && Array.isArray(okxResult.body?.data)) {
        const rows = okxResult.body.data.map((row: any) => {
          const pair = String(row.instId ?? "").split("-");
          const updatedAt = Number(row.ts);
          const open = Number(row.open24h);
          const price = Number(row.last);
          return {
            base: pair[0] ?? "",
            quote: pair[1] ?? "",
            price,
            updatedAt,
            change: open > 0 && price > 0 ? ((price / open) - 1) * 100 : undefined,
            volume: Number(row.volCcy24h),
          };
        });
        for (const definition of definitions) {
          const candidates = rows.filter((row: any) => providerSymbolMatch(definition, row.base))
            .filter((row: any) => Date.now() - row.updatedAt <= 120_000 && row.updatedAt > 0);
          const selected = chooseSnapshotPair(candidates);
          if (selected) data[definition.symbol] = {
            usd: selected.price,
            usd_24h_change: selected.change,
            usd_24h_vol: Number.isFinite(selected.volume) ? selected.volume : undefined,
            updatedAt: selected.updatedAt,
          };
        }
      }

      // Gate's bulk snapshot fills instruments not listed on OKX. This is used
      // only for the public visual market summary, never trade execution.
      const gateResult = definitions.some((definition) => !(data[definition.symbol]?.usd && data[definition.symbol].usd! > 0))
        ? await fetchJson(req, "gate-snapshot", "https://api.gateio.ws/api/v4/spot/tickers")
        : null;
      if (gateResult?.response.ok && Array.isArray(gateResult.body)) {
        const rows = gateResult.body.map((row: any) => {
          const pair = String(row.currency_pair ?? "").split("_");
          const price = Number(row.last);
          return {
            base: pair[0] ?? "",
            quote: pair[1] ?? "",
            price,
            updatedAt: Date.now(),
            change: Number.isFinite(Number(row.change_percentage)) ? Number(row.change_percentage) : undefined,
            volume: Number(row.quote_volume),
          };
        });
        for (const definition of definitions) {
          if (data[definition.symbol]?.usd && data[definition.symbol].usd! > 0) continue;
          const candidates = rows.filter((row: any) => providerSymbolMatch(definition, row.base));
          const selected = chooseSnapshotPair(candidates);
          if (selected) data[definition.symbol] = {
            usd: selected.price,
            usd_24h_change: selected.change,
            usd_24h_vol: Number.isFinite(selected.volume) ? selected.volume : undefined,
            updatedAt: selected.updatedAt,
          };
        }
      }

      // Bybit's bulk spot snapshot fills symbols missing from OKX and Gate.
      const bybitResult = definitions.some((definition) => !(data[definition.symbol]?.usd && data[definition.symbol].usd! > 0))
        ? await fetchJson(req, "bybit-snapshot", "https://api.bybit.com/v5/market/tickers?category=spot")
        : null;
      if (bybitResult?.response.ok && Number(bybitResult.body?.retCode ?? -1) === 0 &&
        Array.isArray(bybitResult.body?.result?.list)) {
        const bybitFetchedAt = Number(bybitResult.body.time) || Date.now();
        const rows = bybitResult.body.result.list.map((ticker: any) => {
          const symbol = String(ticker.symbol ?? "").toUpperCase();
          const quote = ["USDC", "USDT", "USD"].find((suffix) => symbol.endsWith(suffix));
          return {
            base: quote ? symbol.slice(0, -quote.length) : "",
            quote: quote ?? "",
            price: Number(ticker.lastPrice),
            updatedAt: bybitFetchedAt,
            change: Number.isFinite(Number(ticker.price24hPcnt)) ? Number(ticker.price24hPcnt) * 100 : undefined,
            volume: Number(ticker.turnover24h),
          };
        });
        for (const definition of definitions) {
          if (data[definition.symbol]?.usd && data[definition.symbol].usd! > 0) continue;
          const candidates = rows
            .filter((row: any) => providerSymbolMatch(definition, row.base))
            .filter((row: any) => row.updatedAt > 0 && Date.now() - row.updatedAt <= 30_000);
          const selected = chooseSnapshotPair(candidates);
          if (selected) data[definition.symbol] = {
            usd: selected.price,
            usd_24h_change: selected.change,
            usd_24h_vol: Number.isFinite(selected.volume) ? selected.volume : undefined,
            updatedAt: selected.updatedAt,
          };
        }
      }

      // MEXC's bulk ticker snapshot is another display-only fallback; closeTime
      // is used when supplied by the exchange, never for executable order marks.
      const mexcResult = definitions.some((definition) => !(data[definition.symbol]?.usd && data[definition.symbol].usd! > 0))
        ? await fetchJson(req, "mexc-snapshot", "https://api.mexc.com/api/v3/ticker/24hr")
        : null;
      if (mexcResult?.response.ok && Array.isArray(mexcResult.body)) {
        const mexcFetchedAt = Date.now();
        const rows = mexcResult.body.map((ticker: any) => {
          const symbol = String(ticker.symbol ?? "").toUpperCase();
          const quote = ["USDC", "USDT", "USD"].find((suffix) => symbol.endsWith(suffix));
          const closeTime = Number(ticker.closeTime);
          return {
            base: quote ? symbol.slice(0, -quote.length) : "",
            quote: quote ?? "",
            price: Number(ticker.lastPrice),
            updatedAt: Number.isFinite(closeTime) && closeTime > 0 ? closeTime : mexcFetchedAt,
            change: Number.isFinite(Number(ticker.priceChangePercent)) ? Number(ticker.priceChangePercent) : undefined,
            volume: Number(ticker.quoteVolume),
          };
        });
        for (const definition of definitions) {
          if (data[definition.symbol]?.usd && data[definition.symbol].usd! > 0) continue;
          const candidates = rows
            .filter((row: any) => providerSymbolMatch(definition, row.base))
            .filter((row: any) => row.updatedAt > 0 && Date.now() - row.updatedAt <= 120_000);
          const selected = chooseSnapshotPair(candidates);
          if (selected) data[definition.symbol] = {
            usd: selected.price,
            usd_24h_change: selected.change,
            usd_24h_vol: Number.isFinite(selected.volume) ? selected.volume : undefined,
            updatedAt: selected.updatedAt,
          };
        }
      }

      // KuCoin's all-tickers endpoint publishes a snapshot every two seconds.
      // Cache it independently so missing OKX/Gate symbols such as XMR can
      // still move without hammering the public ticker endpoint.
      const snapshotNow = Date.now();
      if (kucoinSnapshotCache && snapshotNow - kucoinSnapshotCache.fetchedAt < 1_800) {
        // Reuse the recent provider snapshot.
      } else if (snapshotNow >= kucoinSnapshotRetryAfter &&
          definitions.some((definition) => !(data[definition.symbol]?.usd && data[definition.symbol].usd! > 0))) {
        const kucoinResult = await fetchJson(req, "kucoin-snapshot", "https://api.kucoin.com/api/v1/market/allTickers");
        const body = kucoinResult?.body;
        const sourceAt = Number(body?.data?.time);
        const rows = body?.data?.ticker;
        if (kucoinResult?.response.ok && Number(body?.code ?? "200000") === 200000 &&
          Number.isFinite(sourceAt) && Math.abs(Date.now() - sourceAt) <= 30_000 &&
          Array.isArray(rows)) {
          kucoinSnapshotCache = { rows, sourceAt, fetchedAt: Date.now() };
          kucoinSnapshotRetryAfter = 0;
        } else {
          kucoinSnapshotRetryAfter = Date.now() + 15_000;
        }
      }

      const kucoinCache = kucoinSnapshotCache;
      if (kucoinCache && Date.now() - kucoinCache.sourceAt <= 30_000) {
        const rows = kucoinCache.rows.map((ticker: any) => {
          const pair = String(ticker.symbol ?? "").split("-");
          const price = Number(ticker.last);
          return {
            base: pair[0] ?? "",
            quote: pair[1] ?? "",
            price,
            updatedAt: kucoinCache.sourceAt,
            change: Number.isFinite(Number(ticker.changeRate)) ? Number(ticker.changeRate) * 100 : undefined,
            volume: Number(ticker.volValue),
          };
        });
        for (const definition of definitions) {
          if (data[definition.symbol]?.usd && data[definition.symbol].usd! > 0) continue;
          const candidates = rows.filter((row: any) => providerSymbolMatch(definition, row.base))
            .filter((row: any) => Date.now() - row.updatedAt <= 30_000 && row.updatedAt > 0);
          const selected = chooseSnapshotPair(candidates);
          if (selected) data[definition.symbol] = {
            usd: selected.price,
            usd_24h_change: selected.change,
            usd_24h_vol: Number.isFinite(selected.volume) ? selected.volume : undefined,
            updatedAt: selected.updatedAt,
          };
        }
      }

      marketSnapshotCache = { data, fetchedAt: Date.now() };
      return data;
    })().finally(() => {
      marketSnapshotPending = null;
    });
    return marketSnapshotPending;
  };
}

export function createFuturesQuoteFetcher(
  definitions: AssetDefinition[],
  binanceSymbols: Record<string, string>,
  _marketHeaders: Record<string, string>,
) {
  const cached = new Map<string, { value: FuturesQuote | null; fetchedAt: number }>();
  const pending = new Map<string, Promise<FuturesQuote | null>>();

  return async (req: Request, asset: string): Promise<FuturesQuote | null> => {
    const symbol = asset.toUpperCase() === "GOLD" ? "XAUT" : asset.toUpperCase();
    const definition = definitions.find((item) => item.symbol.toUpperCase() === symbol);
    if (!definition) return null;
    const snapshot = cached.get(symbol);
    if (snapshot && Date.now() - snapshot.fetchedAt < QUOTE_CACHE_MS) {
      return snapshot.value && Date.now() - snapshot.value.updatedAt <= MAX_TRADE_AGE_MS ? snapshot.value : null;
    }
    let request = pending.get(symbol);
    if (!request) {
      request = fetchLiveQuote(req, definition, binanceSymbols)
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

type ChartPoint = { t: number; price: number };
function cleanPoints(points: ChartPoint[]): ChartPoint[] {
  const byTime = new Map<number, ChartPoint>();
  for (const point of points) {
    if (Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0 && point.t <= Date.now()) {
      byTime.set(point.t, point);
    }
  }
  return [...byTime.values()].sort((a, b) => a.t - b.t).slice(-MARKET_HISTORY_LIMIT);
}

async function fetchOkxHistory(req: Request, symbol: string): Promise<ChartPoint[]> {
  for (const pair of okxPairs(symbol)) {
    if (pairIsUnsupported("okx-candles", pair)) continue;
    const result = await fetchJson(req, "okx-candles",
      "https://www.okx.com/api/v5/market/candles?instId=" + encodeURIComponent(pair) + "&bar=1m&limit=80");
    if (!result) return [];
    const rows = result.body?.data;
    if (!result.response.ok || String(result.body?.code ?? "") !== "0" || !Array.isArray(rows) || !rows.length) {
      blockPair("okx-candles", pair);
      continue;
    }
    const points = cleanPoints(rows.map((row: any) => ({ t: Number(row[0]), price: Number(row[4]) })));
    if (points.length) return points;
  }
  return [];
}

async function fetchGateHistory(req: Request, symbol: string): Promise<ChartPoint[]> {
  for (const pair of gatePairs(symbol)) {
    if (pairIsUnsupported("gate-candles", pair)) continue;
    const result = await fetchJson(req, "gate-candles",
      "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=" + encodeURIComponent(pair) + "&interval=1m&limit=80");
    if (!result) return [];
    if (!result.response.ok || !Array.isArray(result.body) || !result.body.length) {
      blockPair("gate-candles", pair);
      continue;
    }
    const points = cleanPoints(result.body.map((row: any) => ({ t: Number(row[0]) * 1000, price: Number(row[2]) })));
    if (points.length) return points;
  }
  return [];
}

async function fetchKucoinHistory(req: Request, symbol: string): Promise<ChartPoint[]> {
  for (const pair of kucoinPairs(symbol)) {
    if (pairIsUnsupported("kucoin-candles", pair)) continue;
    const result = await fetchJson(req, "kucoin-candles",
      "https://api.kucoin.com/api/v1/market/candles?type=1min&symbol=" + encodeURIComponent(pair));
    if (!result) return [];
    const rows = result.body?.data;
    if (!result.response.ok || Number(result.body?.code ?? "200000") !== 200000 || !Array.isArray(rows) || !rows.length) {
      blockPair("kucoin-candles", pair);
      continue;
    }
    const points = cleanPoints(rows.map((row: any) => ({ t: Number(row[0]) * 1000, price: Number(row[2]) })));
    if (points.length) return points;
  }
  return [];
}

async function fetchCoinbaseHistory(req: Request, symbol: string): Promise<ChartPoint[]> {
  const product = COINBASE_PRODUCTS[symbol];
  if (!product || pairIsUnsupported("coinbase-candles", product)) return [];
  const result = await fetchJson(req, "coinbase-candles",
    "https://api.exchange.coinbase.com/products/" + encodeURIComponent(product) + "/candles?granularity=60");
  const rows = result?.body;
  if (!result?.response.ok || !Array.isArray(rows) || !rows.length) {
    if (result) blockPair("coinbase-candles", product);
    return [];
  }
  return cleanPoints(rows.map((row: any) => ({ t: Number(row[0]) * 1000, price: Number(row[4]) })));
}

async function fetchKrakenHistory(req: Request, symbol: string): Promise<ChartPoint[]> {
  const pair = KRAKEN_PAIRS[symbol];
  if (!pair || pairIsUnsupported("kraken-candles", pair)) return [];
  const result = await fetchJson(req, "kraken-candles",
    "https://api.kraken.com/0/public/OHLC?pair=" + encodeURIComponent(pair) + "&interval=1");
  if (!result?.response.ok || !result.body?.result || (result.body?.error?.length ?? 0) > 0) {
    if (result) blockPair("kraken-candles", pair);
    return [];
  }
  const rows = Object.entries(result.body.result).filter(([key, value]) => key !== "last" && Array.isArray(value)).flatMap(([, value]) => value as any[]);
  return cleanPoints(rows.map((row: any) => ({ t: Number(row[0]) * 1000, price: Number(row[4]) })));
}

export function createTradingHistoryFetcher(
  definitions: AssetDefinition[],
  _binanceSymbols: Record<string, string>,
  _marketHeaders: Record<string, string>,
) {
  return async (req: Request, asset: string): Promise<ChartPoint[]> => {
    const lookupSymbol = asset.toUpperCase() === "GOLD" ? "XAUT" : asset.toUpperCase();
    const definition = definitions.find((item) => item.symbol.toUpperCase() === lookupSymbol);
    if (!definition) return [];
    const symbol = exchangeSymbolForAsset(definition);
    // As with executable quotes, do not use Kraken's ambiguous CC/USD market
    // (CloudChat) for Canton Network, or a separate TON token for Toncoin.
    const hasProviderSpecificSymbol = definition.id === "canton-network" || definition.id === "the-open-network";
    const providers = hasProviderSpecificSymbol
      ? [
          () => fetchOkxHistory(req, symbol),
          () => fetchGateHistory(req, symbol),
          () => fetchKucoinHistory(req, symbol),
        ]
      : [
          () => fetchOkxHistory(req, symbol),
          () => fetchGateHistory(req, symbol),
          () => fetchKucoinHistory(req, symbol),
          () => fetchCoinbaseHistory(req, symbol),
          () => fetchKrakenHistory(req, symbol),
        ];
    for (const provider of providers) {
      const history = await provider().catch((error) => {
        req.log.debug({ err: error, symbol }, "Trading chart history provider failed");
        return [];
      });
      if (history.length > 0) return history;
    }
    req.log.warn({ symbol }, "No real market history is available from the exchange providers");
    return [];
  };
}
