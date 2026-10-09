export type LiveMarketTick = {
  asset: string;
  price: number;
  updatedAt: number;
  sources: number | null;
  pairs: number | null;
};

export type LivePricePoint = { t: number; price: number };

// CoinPaprika's public live stream supports these symbols in the current
// /assets catalogue. A single multiplexed connection is used per API process.
export const LIVE_MARKET_SYMBOLS = [
  "BTC", "ETH", "USDT", "BNB", "USDC", "DAI", "XRP", "SOL", "TRX",
  "HYPE", "ZEC", "DOGE", "XMR", "LINK", "ADA", "XLM", "BCH", "USD1",
  "USDE", "LTC", "HBAR", "AVAX", "SUI", "SHIB", "UNI", "CRO",
] as const;

const supportedSymbols = new Set<string>(LIVE_MARKET_SYMBOLS);
const latestTicks = new Map<string, LiveMarketTick>();
const historyBySymbol = new Map<string, LivePricePoint[]>();
const MAX_HISTORY_POINTS = 180;
const MAX_LIVE_AGE_MS = 15_000;
let feedStarted = false;
let lastStreamWarningAt = 0;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function warnOncePerMinute(message: string, error?: unknown) {
  const now = Date.now();
  if (now - lastStreamWarningAt < 60_000) return;
  lastStreamWarningAt = now;
  console.warn(message, error instanceof Error ? error.message : error ?? "");
}

/** Parse one source event while preserving its own timestamp; never synthesize a price tick. */
export function parseLiveMarketTick(value: unknown, now = Date.now()): LiveMarketTick | null {
  if (!value || typeof value !== "object") return null;
  const row = value as {
    asset?: unknown;
    price?: unknown;
    timestamp?: unknown;
    sources?: unknown;
    pairs?: unknown;
  };
  const asset = String(row.asset ?? "").trim().toUpperCase();
  const price = Number(row.price);
  const updatedAt = typeof row.timestamp === "string"
    ? Date.parse(row.timestamp)
    : Number.NaN;
  if (!supportedSymbols.has(asset) || !Number.isFinite(price) || price <= 0
    || !Number.isFinite(updatedAt) || updatedAt > now + 2_000 || now - updatedAt > 60_000) {
    return null;
  }
  return {
    asset,
    price,
    updatedAt,
    sources: Number.isFinite(Number(row.sources)) ? Number(row.sources) : null,
    pairs: Number.isFinite(Number(row.pairs)) ? Number(row.pairs) : null,
  };
}

function rememberLiveMarketTick(value: unknown) {
  const tick = parseLiveMarketTick(value);
  if (!tick) return;
  const previous = latestTicks.get(tick.asset);
  if (previous && tick.updatedAt <= previous.updatedAt) return;
  latestTicks.set(tick.asset, tick);
  const history = historyBySymbol.get(tick.asset) ?? [];
  history.push({ t: tick.updatedAt, price: tick.price });
  if (history.length > MAX_HISTORY_POINTS) history.splice(0, history.length - MAX_HISTORY_POINTS);
  historyBySymbol.set(tick.asset, history);
}

async function getSupportedStreamSymbols(): Promise<string[]> {
  try {
    const response = await fetch("https://live.coinpaprika.com/assets", {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const body = await response.json() as { assets?: Array<string | { asset?: string }> };
      const available = new Set((body.assets ?? []).map((item) =>
        String(typeof item === "string" ? item : item.asset ?? "").toUpperCase(),
      ));
      const supported = LIVE_MARKET_SYMBOLS.filter((symbol) => available.has(symbol));
      if (supported.length > 0) return [...supported];
    }
  } catch (error) {
    warnOncePerMinute("Live market stream asset discovery failed; using the last known supported symbol list.", error);
  }
  return [...LIVE_MARKET_SYMBOLS];
}

async function liveFeedLoop(): Promise<void> {
  while (true) {
    try {
      const symbols = await getSupportedStreamSymbols();
      const url = `https://live.coinpaprika.com/stream?asset=${encodeURIComponent(symbols.join(","))}&interval=1s`;
      const response = await fetch(url, {
        headers: { accept: "text/event-stream" },
      });
      if (!response.ok || !response.body) {
        throw new Error(`Live market stream returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        buffer += decoder.decode(part.value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            rememberLiveMarketTick(JSON.parse(line.slice(5).trim()));
          } catch {
            // Ignore malformed individual events without breaking the stream.
          }
        }
      }
      try { await reader.cancel(); } catch { /* stream already closed */ }
      throw new Error("Live market stream ended; reconnecting.");
    } catch (error) {
      warnOncePerMinute("Live market stream disconnected; reconnecting.", error);
      await sleep(2_000);
    }
  }
}

/** Start exactly one multiplexed SSE connection for this API process. */
export function ensureLiveMarketFeedStarted() {
  if (feedStarted) return;
  feedStarted = true;
  void liveFeedLoop();
}

function normalizeFeedSymbol(asset: string) {
  return asset.toUpperCase() === "GOLD" ? "XAUT" : asset.toUpperCase();
}

/** Return a genuinely recent source-timestamped tick, or null when the feed is stale/unavailable. */
export function getLatestLiveMarketQuote(
  asset: string,
  maxAgeMs = MAX_LIVE_AGE_MS,
  now = Date.now(),
): { price: number; updatedAt: number } | null {
  ensureLiveMarketFeedStarted();
  const tick = latestTicks.get(normalizeFeedSymbol(asset));
  if (!tick || now - tick.updatedAt > maxAgeMs || tick.updatedAt > now + 2_000) return null;
  return { price: tick.price, updatedAt: tick.updatedAt };
}

/** Recent real feed points for the Trading chart, oldest first. */
export function getLiveMarketHistory(asset: string, limit = MAX_HISTORY_POINTS): LivePricePoint[] {
  ensureLiveMarketFeedStarted();
  const rows = historyBySymbol.get(normalizeFeedSymbol(asset)) ?? [];
  return rows.slice(-Math.max(1, Math.min(limit, MAX_HISTORY_POINTS))).map((point) => ({ ...point }));
}
