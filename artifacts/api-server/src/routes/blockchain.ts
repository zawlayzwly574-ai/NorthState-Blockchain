import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, desc, count, and, inArray } from "drizzle-orm";
import { generateSecret as totpGenerateSecret, generateURI as totpGenerateURI, verifySync as totpVerifySync } from "otplib";
import {
  db,
  activitiesTable,
  holdingsTable,
  kycSubmissionsTable,
  passkeysTable,
  supportMessagesTable,
  supportThreadsTable,
  tradesTable,
  tradingAccountsTable,
  transactionsTable,
  walletProfilesTable,
} from "@workspace/db";
import {
  CreateDepositBody,
  CreateDepositResponse,
  CreateReferralShareBody,
  CreateReferralShareResponse,
  CreateSendBody,
  CreateSendResponse,
  CreateSwapBody,
  CreateSwapResponse,
  CreateWithdrawalBody,
  CreateWithdrawalResponse,
  GetActivityResponse,
  GetFxRatesResponse,
  GetMarketDetailParams,
  GetMarketDetailResponse,
  GetMarketSummaryResponse,
  GetMiningPlaceResponse,
  GetPortfolioResponse,
  GetProfileResponse,
  GetReferralResponse,
  SubmitKycBody,
  SubmitKycResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type MarketDefinition = {
  symbol: string;
  name: string;
  id: string;
  color: string;
  rank: number;
};

type MiningPlaceDefinition = {
  symbol: string;
  name: string;
  category: "gold" | "energy" | "stock" | "oil" | "real_estate";
  yahooSymbol: string;
  unit: string;
  fallbackPrice: number;
  fallbackChange: number;
  color: string;
};

type MiningPlaceAsset = {
  symbol: string;
  name: string;
  category: MiningPlaceDefinition["category"];
  price: number;
  change24h: number;
  currency: string;
  unit: string;
  status: "live" | "stale" | "fallback";
  updatedAt: string;
  color: string;
};

const marketDefinitions: MarketDefinition[] = [
  { symbol: "BTC", name: "Bitcoin", id: "bitcoin", color: "#F7931A", rank: 1 },
  { symbol: "ETH", name: "Ethereum", id: "ethereum", color: "#627EEA", rank: 2 },
  { symbol: "USDT", name: "Tether", id: "tether", color: "#26A17B", rank: 3 },
  { symbol: "BNB", name: "BNB", id: "binancecoin", color: "#F3BA2F", rank: 4 },
  { symbol: "USDC", name: "USD Coin", id: "usd-coin", color: "#2775CA", rank: 5 },
  { symbol: "DAI", name: "Dai", id: "dai", color: "#F5AC37", rank: 6 },
  { symbol: "FDUSD", name: "First Digital USD", id: "first-digital-usd", color: "#3D8BFF", rank: 7 },
];

const seedPrices: Record<string, number> = {
  bitcoin: 62987.32,
  ethereum: 3124.77,
  tether: 1,
  binancecoin: 582.14,
  "usd-coin": 1,
  dai: 0.9998,
  "first-digital-usd": 1,
};

const seedChanges: Record<string, number> = {
  bitcoin: 2.84,
  ethereum: 1.61,
  tether: 0.02,
  binancecoin: -0.44,
  "usd-coin": 0.01,
  dai: -0.03,
  "first-digital-usd": 0.04,
};

const miningPlaceDefinitions: MiningPlaceDefinition[] = [
  { symbol: "GOLD", name: "Gold", category: "gold", yahooSymbol: "GC=F", unit: "oz", fallbackPrice: 2348.4, fallbackChange: 0.42, color: "#d6ad3b" },
  { symbol: "XLE", name: "Energy Select Sector", category: "energy", yahooSymbol: "XLE", unit: "share", fallbackPrice: 91.72, fallbackChange: 0.68, color: "#4dbb8a" },
  { symbol: "OIL", name: "Crude Oil", category: "oil", yahooSymbol: "CL=F", unit: "barrel", fallbackPrice: 78.34, fallbackChange: -0.31, color: "#9d7b52" },
  { symbol: "VNQ", name: "Real Estate", category: "real_estate", yahooSymbol: "VNQ", unit: "share", fallbackPrice: 88.26, fallbackChange: 0.24, color: "#7b9bb8" },
  { symbol: "AAPL", name: "Apple", category: "stock", yahooSymbol: "AAPL", unit: "share", fallbackPrice: 229.35, fallbackChange: 0.87, color: "#b8c1cc" },
  { symbol: "TSLA", name: "Tesla", category: "stock", yahooSymbol: "TSLA", unit: "share", fallbackPrice: 348.68, fallbackChange: -1.14, color: "#d86464" },
  { symbol: "NVDA", name: "Nvidia", category: "stock", yahooSymbol: "NVDA", unit: "share", fallbackPrice: 181.22, fallbackChange: 1.92, color: "#76b900" },
  { symbol: "MSFT", name: "Microsoft", category: "stock", yahooSymbol: "MSFT", unit: "share", fallbackPrice: 506.69, fallbackChange: 0.51, color: "#4a9fe3" },
  { symbol: "AMZN", name: "Amazon", category: "stock", yahooSymbol: "AMZN", unit: "share", fallbackPrice: 231.62, fallbackChange: -0.22, color: "#e8a43a" },
];

let miningPlaceCache: { assets: MiningPlaceAsset[]; ts: number } | null = null;
let miningPlaceRefreshPromise: Promise<{ assets: MiningPlaceAsset[]; ts: number }> | null = null;
const MINING_PLACE_TTL = 3_000;
const MINING_PLACE_MAX_STALE_AGE = 7 * 24 * 60 * 60_000;
const YAHOO_FINANCE_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

function getUserId(req: Request) {
  return getAuth(req).userId!;
}

function requireMember(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/admin")) {
    next();
    return;
  }

  if (!getAuth(req).userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
}

function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function fetchClerkUserInfo(userId: string): Promise<{ email: string; name: string }> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const email = user.emailAddresses[0]?.emailAddress ?? "";
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "";
    return { email, name };
  } catch {
    return { email: "", name: "" };
  }
}

async function ensureSeededUser(userId: string) {
  const [existing] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    // Backfill real Clerk email/name for real users that still have fallback defaults
    if (userId !== "demo_user" && (existing.email === "member@northstateblockchain.app" || existing.displayName === "North State Blockchain Member")) {
      const { email, name } = await fetchClerkUserInfo(userId);
      if (email || name) {
        const update: Partial<typeof walletProfilesTable.$inferInsert> = {};
        if (email && existing.email === "member@northstateblockchain.app") update.email = email;
        if (name && existing.displayName === "North State Blockchain Member") update.displayName = name;
        if (Object.keys(update).length) {
          await db.update(walletProfilesTable).set(update).where(eq(walletProfilesTable.clerkUserId, userId));
          return { ...existing, ...update };
        }
      }
    }
    return existing;
  }

  const isDemoUser = userId === "demo_user";

  let displayName = isDemoUser ? "Alex Morgan" : "North State Blockchain Member";
  let email = isDemoUser ? "alex@example.com" : "member@northstateblockchain.app";

  if (!isDemoUser) {
    const info = await fetchClerkUserInfo(userId);
    if (info.email) email = info.email;
    if (info.name) displayName = info.name;
  }

  const [profile] = await db
    .insert(walletProfilesTable)
    .values({
      clerkUserId: userId,
      displayName,
      email,
      referralCode: isDemoUser ? "NORTHSTATE-ALEX" : `NORTHSTATE-${userId.slice(-6).toUpperCase()}`,
      // Real users start unverified and must complete KYC; demo user is pre-verified
      verificationStatus: isDemoUser ? "verified" : "unverified",
      referralInvitedCount: isDemoUser ? 3 : 0,
      referralReward: isDemoUser ? "42.50" : "0",
    })
    .onConflictDoNothing()
    .returning();

  // If insert was a no-op (concurrent race), fetch the existing row
  if (!profile) {
    const [fetched] = await db
      .select()
      .from(walletProfilesTable)
      .where(eq(walletProfilesTable.clerkUserId, userId))
      .limit(1);
    if (fetched) return fetched;
  }

  // Only seed demo user with sample holdings and activities; real users start at $0
  if (isDemoUser) {
    const seededHoldings = [
      ["BTC", "Bitcoin", "0.1842", "11600.12", "54.50", "2.84", "#F7931A"],
      ["ETH", "Ethereum", "1.842", "5756.44", "27.04", "1.61", "#627EEA"],
      ["USDC", "USD Coin", "1835.2", "1835.20", "8.62", "0.01", "#2775CA"],
      ["BNB", "BNB", "1.22", "710.21", "3.34", "-0.44", "#F3BA2F"],
      ["USDT", "Tether", "320.5", "320.50", "1.50", "0.02", "#26A17B"],
    ] as const;

    await db.insert(holdingsTable).values(
      seededHoldings.map(([symbol, name, amount, value, allocation, change24h, color]) => ({
        clerkUserId: userId,
        symbol,
        name,
        amount,
        value,
        allocation,
        change24h,
        color,
      })),
    );

    await db.insert(activitiesTable).values([
      {
        clerkUserId: userId,
        type: "buy",
        asset: "BTC",
        amount: "0.042",
        value: "2645.48",
        status: "completed",
        createdAt: new Date(Date.now() - 1000 * 60 * 44),
      },
      {
        clerkUserId: userId,
        type: "deposit",
        asset: "USDC",
        amount: "850",
        value: "850",
        status: "completed",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      },
      {
        clerkUserId: userId,
        type: "withdrawal",
        asset: "ETH",
        amount: "0.18",
        value: "562.46",
        status: "pending",
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 22),
      },
    ]);
  }

  return profile;
}

const MARKET_API_KEY = process.env.MARKET_API_KEY ?? "";
const marketHeaders: Record<string, string> = { accept: "application/json" };
if (MARKET_API_KEY) {
  marketHeaders["x-cg-pro-api-key"] = MARKET_API_KEY;
  marketHeaders["x-cg-demo-api-key"] = MARKET_API_KEY;
}

type MarketQuote = {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
};

type MarketAsset = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  rank: number;
  color: string;
};

type BinanceTicker = {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
};

const binanceSymbols: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  "usd-coin": "USDCUSDT",
  dai: "DAIUSDT",
  "first-digital-usd": "FDUSDUSDT",
};

function isValidMarketQuote(quote: MarketQuote | undefined) {
  return Number.isFinite(quote?.usd) && (quote?.usd ?? 0) > 0;
}

let marketCache: { assets: MarketAsset[]; ts: number } | null = null;
let marketRefreshPromise: Promise<MarketAsset[]> | null = null;
const MARKET_DATA_TTL = 3_000;

async function fetchBinanceMarketData(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
) {
  const symbols = Object.values(binanceSymbols);
  const endpoint = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      req.log.warn({ status: response.status }, "Alternate market provider returned a non-success status");
      return {} as Record<string, MarketQuote>;
    }

    const tickers = (await response.json()) as BinanceTicker[];
    return tickers.reduce<Record<string, MarketQuote>>((quotes, ticker) => {
      const marketId = Object.entries(binanceSymbols).find(([, symbol]) => symbol === ticker.symbol)?.[0];
      const price = Number(ticker.lastPrice);
      if (marketId && Number.isFinite(price) && price > 0) {
        quotes[marketId] = {
          usd: price,
          usd_24h_change: Number(ticker.priceChangePercent),
          usd_24h_vol: Number(ticker.quoteVolume),
        };
      }
      return quotes;
    }, {});
  } catch (error) {
    req.log.warn({ err: error }, "Alternate market provider could not be reached");
    return {} as Record<string, MarketQuote>;
  }
}

async function fetchFreshMarketAssets(req: Parameters<Parameters<IRouter["get"]>[1]>[0]): Promise<MarketAsset[]> {
  const ids = marketDefinitions.map((asset) => asset.id).join(",");
  const endpoint = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
  let liveData: Record<string, MarketQuote> = {};

  try {
    const response = await fetch(endpoint, {
      headers: marketHeaders,
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      liveData = (await response.json()) as typeof liveData;
    } else {
      req.log.warn({ status: response.status }, "Market provider returned a non-success status");
    }
  } catch (error) {
    req.log.warn({ err: error }, "Market provider could not be reached; trying alternate quotes");
  }

  const missingIds = marketDefinitions.some((definition) => !isValidMarketQuote(liveData[definition.id]));
  if (missingIds) {
    const alternateData = await fetchBinanceMarketData(req);
    for (const definition of marketDefinitions) {
      if (!isValidMarketQuote(liveData[definition.id]) && isValidMarketQuote(alternateData[definition.id])) {
        liveData[definition.id] = alternateData[definition.id];
      }
    }
  }

  return marketDefinitions.map((definition) => {
    const provider = liveData[definition.id];
    const price = provider?.usd ?? seedPrices[definition.id];
    return {
      symbol: definition.symbol,
      name: definition.name,
      price,
      change24h: provider?.usd_24h_change ?? seedChanges[definition.id],
      marketCap: provider?.usd_market_cap ?? price * (definition.rank === 1 ? 19_800_000 : 1_000_000),
      volume24h: provider?.usd_24h_vol ?? price * (definition.rank === 1 ? 420_000 : 12_000),
      rank: definition.rank,
      color: definition.color,
    };
  });
}

async function fetchMarketAssets(req: Parameters<Parameters<IRouter["get"]>[1]>[0]) {
  const now = Date.now();
  if (marketCache && now - marketCache.ts < MARKET_DATA_TTL) {
    return marketCache.assets;
  }

  if (!marketRefreshPromise) {
    marketRefreshPromise = fetchFreshMarketAssets(req)
      .then((assets) => {
        marketCache = { assets, ts: Date.now() };
        return assets;
      })
      .finally(() => {
        marketRefreshPromise = null;
      });
  }

  return marketRefreshPromise;
}

router.get("/markets", async (req, res) => {
  const data = GetMarketSummaryResponse.parse(await fetchMarketAssets(req));
  res.json(data);
});

router.get("/mining-place", async (req, res) => {
  const now = Date.now();
  if (miningPlaceCache && now - miningPlaceCache.ts < MINING_PLACE_TTL) {
    res.json(GetMiningPlaceResponse.parse({
      assets: miningPlaceCache.assets,
      updatedAt: new Date(miningPlaceCache.ts).toISOString(),
    }));
    return;
  }

  if (!miningPlaceRefreshPromise) {
    const previousAssets = new Map(miningPlaceCache?.assets.map((asset) => [asset.symbol, asset]));
    miningPlaceRefreshPromise = Promise.all(miningPlaceDefinitions.map(async (definition): Promise<MiningPlaceAsset> => {
    let liveAsset: MiningPlaceAsset | null = null;
    let lastError: unknown = null;
    for (const host of YAHOO_FINANCE_HOSTS) {
      try {
        const response = await fetch(
          `https://${host}/v8/finance/chart/${encodeURIComponent(definition.yahooSymbol)}?range=1d&interval=5m`,
          {
            headers: { accept: "application/json", "user-agent": "Mozilla/5.0 NorthStateBlockchain/1.0" },
            signal: AbortSignal.timeout(5000),
          },
        );
        if (!response.ok) {
          throw new Error(`${host} returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          chart?: {
            result?: Array<{
              meta?: {
                currency?: string;
                regularMarketPrice?: number;
                chartPreviousClose?: number;
                previousClose?: number;
                regularMarketTime?: number;
              };
            }>;
          };
        };
        const meta = payload.chart?.result?.[0]?.meta;
        const price = Number(meta?.regularMarketPrice);
        const previousClose = Number(meta?.chartPreviousClose ?? meta?.previousClose);
        if (!Number.isFinite(price) || price <= 0) {
          throw new Error(`${host} did not return a valid price`);
        }
        const change24h = Number.isFinite(previousClose) && previousClose > 0
          ? ((price - previousClose) / previousClose) * 100
          : definition.fallbackChange;
        liveAsset = {
          symbol: definition.symbol,
          name: definition.name,
          category: definition.category,
          price,
          change24h,
          currency: meta?.currency ?? "USD",
          unit: definition.unit,
          status: "live",
          updatedAt: new Date((meta?.regularMarketTime ?? Math.floor(now / 1000)) * 1000).toISOString(),
          color: definition.color,
        };
        break;
      } catch (error) {
        lastError = error;
        req.log.warn({ err: error, symbol: definition.symbol, host }, "Mining Place quote host failed");
      }
    }

    if (liveAsset) {
      return liveAsset;
    }

    {
      const error = lastError ?? new Error("No Mining Place quote host returned a valid price");
      req.log.warn({ err: error, symbol: definition.symbol }, "Mining Place quote provider could not be reached");
      const previous = previousAssets.get(definition.symbol);
      const previousTimestamp = previous ? Date.parse(previous.updatedAt) : Number.NaN;
      if (
        previous
        && previous.status !== "fallback"
        && Number.isFinite(previousTimestamp)
        && now - previousTimestamp <= MINING_PLACE_MAX_STALE_AGE
      ) {
        return { ...previous, status: "stale" };
      }
      return {
        symbol: definition.symbol,
        name: definition.name,
        category: definition.category,
        price: definition.fallbackPrice,
        change24h: definition.fallbackChange,
        currency: "USD",
        unit: definition.unit,
        status: "fallback",
        updatedAt: new Date(now).toISOString(),
        color: definition.color,
      };
    }
    })).then((assets) => {
      miningPlaceCache = { assets, ts: Date.now() };
      return miningPlaceCache;
    }).finally(() => {
      miningPlaceRefreshPromise = null;
    });
  }

  const refreshed = await miningPlaceRefreshPromise;
  res.json(GetMiningPlaceResponse.parse({
    assets: refreshed.assets,
    updatedAt: new Date(refreshed.ts).toISOString(),
  }));
});

// ─── FX rates (Frankfurter / ECB, free, no key needed) ───────────────────────
let fxCache: { rates: Record<string, number>; ts: number } | null = null;
const FX_TTL = 5 * 60_000; // 5 min

router.get("/markets/fx-rates", async (req, res) => {
  try {
    if (!fxCache || Date.now() - fxCache.ts > FX_TTL) {
      const response = await fetch(
        "https://api.frankfurter.app/latest?from=USD",
        { signal: AbortSignal.timeout(5000) },
      );
      if (response.ok) {
        const body = (await response.json()) as { rates: Record<string, number> };
        // Add USD→USD identity and MMK static rate (not in ECB data)
        fxCache = {
          rates: { USD: 1, ...body.rates, MMK: 2100 },
          ts: Date.now(),
        };
      }
    }
    const rates = fxCache?.rates ?? { USD: 1, EUR: 0.92, GBP: 0.79 };
    res.json(GetFxRatesResponse.parse({ base: "USD", rates }));
  } catch (err) {
    req.log.warn({ err }, "FX rate fetch failed, using fallback");
    res.json(GetFxRatesResponse.parse({
      base: "USD",
      rates: {
        USD: 1, EUR: 0.92, GBP: 0.79, JPY: 149.5, AUD: 1.52, CAD: 1.36,
        CHF: 0.88, CNY: 7.24, HKD: 7.82, SGD: 1.35, SEK: 10.5, NOK: 10.7,
        DKK: 6.91, NZD: 1.64, MXN: 17.1, INR: 83.5, BRL: 5.05, KRW: 1330,
        ZAR: 18.6, THB: 35.1, MYR: 4.72, IDR: 15750, PHP: 56.5, AED: 3.67,
        SAR: 3.75, TRY: 32.4, PLN: 4.01, CZK: 23.1, HUF: 357, RON: 4.57,
        MMK: 2100,
      },
    }));
  }
});

router.get("/markets/:symbol", async (req, res) => {
  const params = GetMarketDetailParams.parse(req.params);
  const assets = await fetchMarketAssets(req);
  const asset = assets.find((item) => item.symbol.toLowerCase() === params.symbol.toLowerCase());
  if (!asset) {
    res.status(404).json({ error: "Asset not found" });
    return;
  }

  let chart = Array.from({ length: 25 }, (_, index) => ({
    time: `${String(index).padStart(2, "0")}:00`,
    value: asset.price * (1 + Math.sin(index / 3.4) * 0.012 + (index - 12) * 0.00035),
  }));

  try {
    const definition = marketDefinitions.find((item) => item.symbol === asset.symbol);
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/${definition?.id}/market_chart?vs_currency=usd&days=1&interval=hourly`,
      { headers: marketHeaders, signal: AbortSignal.timeout(5000) },
    );
    if (response.ok) {
      const body = (await response.json()) as { prices?: [number, number][] };
      if (body.prices && body.prices.length > 3) {
        chart = body.prices.slice(-25).map(([timestamp, value]) => ({
          time: new Date(timestamp).toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          }),
          value,
        }));
      }
    }
  } catch (error) {
    req.log.warn({ err: error, symbol: asset.symbol }, "Chart provider could not be reached");
  }

  res.json(GetMarketDetailResponse.parse({ asset, chart }));
});

// Everything after the public market endpoints belongs to the signed-in member
// area. Admin routes opt out here and enforce their own admin secret below.
router.use(requireMember);

router.get("/profile", async (req, res) => {
  const profile = await ensureSeededUser(getUserId(req));
  res.json(GetProfileResponse.parse({
    id: String(profile.id),
    name: profile.displayName,
    email: profile.email,
    initials: profile.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    verificationStatus: profile.verificationStatus,
    twoFactorEnabled: profile.twoFactorEnabled ?? false,
    smsPhoneNumber: profile.smsPhoneNumber ?? null,
    smsPhoneVerified: profile.smsPhoneVerified ?? false,
  }));
});

router.patch("/profile", async (req, res) => {
  const userId = getUserId(req);
  const { displayName } = req.body ?? {};
  if (!displayName || typeof displayName !== "string" || displayName.trim().length < 1) {
    res.status(400).json({ error: "Display name is required." }); return;
  }
  await db
    .update(walletProfilesTable)
    .set({ displayName: displayName.trim() })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  res.json({ success: true });
});

router.get("/notifications", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.clerkUserId, userId))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(15);
  res.json(
    activities.map((a) => ({
      id: String(a.id),
      type: a.type,
      asset: a.asset,
      amount: String(a.amount),
      status: a.status,
      createdAt: a.createdAt.toISOString(),
    })),
  );
});

router.get("/portfolio", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const holdings = await db.select().from(holdingsTable).where(eq(holdingsTable.clerkUserId, userId));
  const value = holdings.reduce((total, holding) => total + asNumber(holding.value), 0);
  const dayChange = holdings.reduce(
    (total, holding) => total + asNumber(holding.value) * (asNumber(holding.change24h) / 100),
    0,
  );
  res.json(GetPortfolioResponse.parse({
    totalValue: value,
    dayChange,
    dayChangePercent: value ? (dayChange / value) * 100 : 0,
    cashBalance: 2480.36,
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name,
      amount: asNumber(holding.amount),
      value: asNumber(holding.value),
      allocation: asNumber(holding.allocation),
      change24h: asNumber(holding.change24h),
      color: holding.color,
    })),
  }));
});

router.get("/activity", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const activities = await db
    .select()
    .from(activitiesTable)
    .where(eq(activitiesTable.clerkUserId, userId))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(20);
  res.json(GetActivityResponse.parse(activities.map((activity) => ({
    id: String(activity.id),
    type: activity.type,
    asset: activity.asset,
    amount: asNumber(activity.amount),
    value: asNumber(activity.value),
    status: activity.status,
    createdAt: activity.createdAt.toISOString(),
  }))));
});

router.get("/referral", async (req, res) => {
  const profile = await ensureSeededUser(getUserId(req));
  res.json(GetReferralResponse.parse({
    code: profile.referralCode,
    invitedCount: profile.referralInvitedCount,
    reward: asNumber(profile.referralReward),
    shareUrl: `${req.protocol}://${req.get("host")}/join/${profile.referralCode}`,
  }));
});

router.post("/referral", async (req, res) => {
  const body = CreateReferralShareBody.parse(req.body);
  const profile = await ensureSeededUser(getUserId(req));
  req.log.info({ channel: body.channel, userId: profile.clerkUserId }, "Referral share recorded");
  res.status(201).json(CreateReferralShareResponse.parse({
    code: profile.referralCode,
    invitedCount: profile.referralInvitedCount,
    reward: asNumber(profile.referralReward),
    shareUrl: `${req.protocol}://${req.get("host")}/join/${profile.referralCode}`,
  }));
});

router.post("/kyc", async (req, res) => {
  const body = SubmitKycBody.parse(req.body);
  const encodedDocument = body.documentImageBase64.slice("data:image/jpeg;base64,".length);
  const normalizedDocument = encodedDocument.replace(/=+$/, "");
  const documentBytes = Buffer.from(encodedDocument, "base64");
  const normalizedDecodedDocument = documentBytes.toString("base64").replace(/=+$/, "");
  const isJpeg = documentBytes.length >= 64
    && documentBytes[0] === 0xff
    && documentBytes[1] === 0xd8
    && documentBytes[2] === 0xff;
  if (!isJpeg || normalizedDecodedDocument !== normalizedDocument) {
    res.status(400).json({ error: "A valid combined JPEG document image is required." });
    return;
  }
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const [submission] = await db.insert(kycSubmissionsTable).values({
    clerkUserId: userId,
    fullName: body.fullName,
    country: body.country,
    city: body.city,
    occupation: body.occupation,
    ssn: "",
    documentType: body.documentType,
    documentImageBase64: body.documentImageBase64,
    status: "pending",
  }).returning();
  await db.update(walletProfilesTable)
    .set({ verificationStatus: "pending" })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  res.status(201).json(SubmitKycResponse.parse({
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
  }));
});

async function createTransaction(
  req: Parameters<Parameters<IRouter["post"]>[1]>[0],
  type: "deposit" | "send" | "withdrawal",
) {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const body = req.body as {
    asset: string;
    amount: number;
    destination?: string;
    txHash?: string;
    proofPath?: string | null;
  };
  const [transaction] = await db.insert(transactionsTable).values({
    clerkUserId: userId,
    type,
    asset: body.asset,
    amount: String(body.amount),
    destination: body.destination ?? null,
    txHash: body.txHash ?? null,
    proofPath: body.proofPath ?? null,
    status: "pending",
  }).returning();
  await db.insert(activitiesTable).values({
    clerkUserId: userId,
    type,
    asset: body.asset,
    amount: String(body.amount),
    value: String(body.amount),
    status: "pending",
    transactionId: transaction.id,
  });
  return {
    id: String(transaction.id),
    type,
    asset: transaction.asset,
    amount: asNumber(transaction.amount),
    status: transaction.status,
    createdAt: transaction.createdAt.toISOString(),
  };
}

router.post("/transactions/deposit", async (req, res) => {
  const body = CreateDepositBody.parse(req.body);
  const data = await createTransaction({ ...req, body } as typeof req, "deposit");
  res.status(201).json(CreateDepositResponse.parse(data));
});

router.post("/transactions/send", async (req, res) => {
  const body = CreateSendBody.parse(req.body);
  const data = await createTransaction({ ...req, body } as typeof req, "send");
  res.status(201).json(CreateSendResponse.parse(data));
});

router.post("/transactions/withdraw", async (req, res) => {
  const body = CreateWithdrawalBody.parse(req.body);
  const data = await createTransaction({ ...req, body } as typeof req, "withdrawal");
  res.status(201).json(CreateWithdrawalResponse.parse(data));
});

// ─── Swap / Convert ───────────────────────────────────────────────────────────
router.post("/transactions/swap", async (req, res) => {
  const body = CreateSwapBody.parse(req.body);
  const userId = getUserId(req);
  await ensureSeededUser(userId);

  const { fromAsset, toAsset, fromAmount } = body;
  if (fromAsset === toAsset) {
    res.status(400).json({ error: "Cannot swap an asset to itself." }); return;
  }
  if (fromAmount <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero." }); return;
  }

  // Fetch current prices
  const assets = await fetchMarketAssets(req);
  const fromDef = assets.find((a) => a.symbol === fromAsset);
  const toDef   = assets.find((a) => a.symbol === toAsset);
  if (!fromDef || !toDef) {
    res.status(400).json({ error: "Unsupported asset symbol." }); return;
  }

  // Compute conversion
  const rate = fromDef.price / toDef.price;
  const toAmount = fromAmount * rate;
  const fromValueUsd = fromAmount * fromDef.price;

  // Verify sufficient balance for fromAsset
  const [fromHolding] = await db
    .select().from(holdingsTable)
    .where(and(eq(holdingsTable.clerkUserId, userId), eq(holdingsTable.symbol, fromAsset)))
    .limit(1);
  if (!fromHolding || asNumber(fromHolding.amount) < fromAmount) {
    res.status(400).json({ error: `Insufficient ${fromAsset} balance.` }); return;
  }

  // Debit fromAsset
  const newFromAmount = Math.max(0, asNumber(fromHolding.amount) - fromAmount);
  const newFromValue  = Math.max(0, asNumber(fromHolding.value) - fromValueUsd);
  await db.update(holdingsTable)
    .set({ amount: String(newFromAmount), value: String(newFromValue) })
    .where(eq(holdingsTable.id, fromHolding.id));

  // Credit toAsset (upsert)
  const [toHolding] = await db
    .select().from(holdingsTable)
    .where(and(eq(holdingsTable.clerkUserId, userId), eq(holdingsTable.symbol, toAsset)))
    .limit(1);
  if (toHolding) {
    await db.update(holdingsTable)
      .set({
        amount: String(asNumber(toHolding.amount) + toAmount),
        value:  String(asNumber(toHolding.value) + fromValueUsd),
      })
      .where(eq(holdingsTable.id, toHolding.id));
  } else {
    await db.insert(holdingsTable).values({
      clerkUserId: userId,
      symbol: toAsset,
      name: toDef.name,
      amount: String(toAmount),
      value:  String(fromValueUsd),
      allocation: "0",
      change24h: String(toDef.change24h),
      color: toDef.color,
    });
  }

  // Record activities
  const executedAt = new Date();
  await db.insert(activitiesTable).values([
    {
      clerkUserId: userId, type: "convert", asset: fromAsset,
      amount: String(fromAmount), value: String(fromValueUsd),
      status: "completed", transactionId: null,
    },
    {
      clerkUserId: userId, type: "convert", asset: toAsset,
      amount: String(toAmount), value: String(fromValueUsd),
      status: "completed", transactionId: null,
    },
  ]);

  res.json(CreateSwapResponse.parse({
    fromAsset, toAsset,
    fromAmount, toAmount,
    rate, executedAt: executedAt.toISOString(),
  }));
});

// ─── Security: TOTP challenge store ─────────────────────────────────────────
const totpPending = new Map<string, { secret: string; expires: number }>();
const passkeyChallenges = new Map<string, { challenge: string; expires: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of totpPending) if (v.expires < now) totpPending.delete(k);
  for (const [k, v] of passkeyChallenges) if (v.expires < now) passkeyChallenges.delete(k);
}, 120_000);

// ─── Security: TOTP 2FA ───────────────────────────────────────────────────────

router.post("/security/totp/setup", async (req, res) => {
  const userId = getUserId(req);
  const profile = await ensureSeededUser(userId);
  const secret = totpGenerateSecret({ length: 20 });
  const uri = totpGenerateURI({ label: profile.email, issuer: "North State Blockchain", secret });
  totpPending.set(userId, { secret, expires: Date.now() + 10 * 60_000 });
  res.json({ secret, uri });
});

router.post("/security/totp/verify", async (req, res) => {
  const userId = getUserId(req);
  const pending = totpPending.get(userId);
  if (!pending || pending.expires < Date.now()) {
    res.status(400).json({ error: "Setup session expired. Please start over." }); return;
  }
  const isValid = totpVerifySync({ token: String(req.body?.code ?? "").trim(), secret: pending.secret, strategy: "totp" });
  if (!isValid) {
    res.status(400).json({ error: "Incorrect code — try again or wait for the next 30-second code." }); return;
  }
  await db.update(walletProfilesTable)
    .set({ totpSecret: pending.secret, twoFactorEnabled: true })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  totpPending.delete(userId);
  res.json({ success: true });
});

router.delete("/security/totp", async (req, res) => {
  const userId = getUserId(req);
  await db.update(walletProfilesTable)
    .set({ totpSecret: null, twoFactorEnabled: false })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  res.json({ success: true });
});

// ─── Security: Passkeys ───────────────────────────────────────────────────────

router.get("/security/passkeys", async (req, res) => {
  const userId = getUserId(req);
  const rows = await db.select().from(passkeysTable)
    .where(eq(passkeysTable.clerkUserId, userId))
    .orderBy(desc(passkeysTable.createdAt));
  res.json(rows.map(pk => ({
    id: String(pk.id),
    deviceName: pk.deviceName,
    transports: pk.transports ?? "",
    createdAt: pk.createdAt.toISOString(),
  })));
});

router.post("/security/passkeys/begin", async (req, res) => {
  const userId = getUserId(req);
  const profile = await ensureSeededUser(userId);
  const { origin } = req.body as { origin: string };
  let rpId = "localhost";
  try { rpId = new URL(origin).hostname; } catch { /* use default */ }
  const challenge = randomBytes(32).toString("base64url");
  const webAuthnUserId = Buffer.from(userId.padEnd(16, "0").slice(0, 16)).toString("base64url");
  passkeyChallenges.set(userId, { challenge, expires: Date.now() + 5 * 60_000 });
  res.json({ challenge, rpId, rpName: "North State Blockchain", userId: webAuthnUserId, userDisplayName: profile.displayName, timeout: 60000 });
});

router.post("/security/passkeys/finish", async (req, res) => {
  const userId = getUserId(req);
  const { credentialId, publicKey, challenge, deviceName, transports } = req.body as {
    credentialId: string; publicKey: string; challenge: string; deviceName?: string; transports?: string;
  };
  const pending = passkeyChallenges.get(userId);
  if (!pending || pending.expires < Date.now()) {
    res.status(400).json({ error: "Registration session expired. Please try again." }); return;
  }
  if (pending.challenge !== challenge) {
    res.status(400).json({ error: "Challenge mismatch — please start registration again." }); return;
  }
  const [inserted] = await db.insert(passkeysTable).values({
    clerkUserId: userId,
    credentialId,
    publicKey: publicKey || credentialId,
    deviceName: deviceName || "Passkey",
    transports: transports ?? "[]",
    counter: 0,
  }).returning();
  passkeyChallenges.delete(userId);
  res.json({ id: String(inserted.id), deviceName: inserted.deviceName, transports: inserted.transports ?? "", createdAt: inserted.createdAt.toISOString() });
});

router.delete("/security/passkeys/:id", async (req, res) => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid passkey ID." }); return; }
  await db.delete(passkeysTable).where(and(eq(passkeysTable.id, id), eq(passkeysTable.clerkUserId, userId)));
  res.json({ success: true });
});

// ─── SMS OTP store ────────────────────────────────────────────────────────────
const smsOtpStore = new Map<string, { code: string; expires: number; userId: string }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of smsOtpStore) if (v.expires < now) smsOtpStore.delete(k);
}, 120_000);

router.post("/sms/send-otp", async (req, res) => {
  const userId = getUserId(req);
  const { phoneNumber } = req.body as { phoneNumber?: string };
  const phone = String(phoneNumber ?? "").trim();
  if (!phone || phone.replace(/\D/g, "").length < 7) {
    res.status(400).json({ error: "A valid phone number is required." }); return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    res.status(503).json({ error: "SMS service is not yet configured. Please contact support." }); return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = Date.now() + 5 * 60_000;
  smsOtpStore.set(phone, { code, expires, userId });

  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your North State Blockchain verification code is ${code}. Valid for 5 minutes. Do not share this code.`,
      from: fromNumber,
      to: phone,
    });
    res.json({ sent: true, expiresAt: new Date(expires).toISOString() });
  } catch (err: any) {
    smsOtpStore.delete(phone);
    res.status(500).json({ error: err?.message ?? "Failed to send SMS. Please verify the phone number and try again." });
  }
});

router.post("/sms/verify-otp", async (req, res) => {
  const userId = getUserId(req);
  const { phoneNumber, code } = req.body as { phoneNumber?: string; code?: string };
  const phone = String(phoneNumber ?? "").trim();
  const otp = String(code ?? "").trim();
  if (!phone || !otp) {
    res.status(400).json({ error: "Phone number and code are required." }); return;
  }
  const entry = smsOtpStore.get(phone);
  if (!entry || entry.expires < Date.now()) {
    res.status(400).json({ error: "Code has expired. Please request a new one." }); return;
  }
  if (entry.userId !== userId) {
    res.status(403).json({ error: "Verification session mismatch." }); return;
  }
  if (entry.code !== otp) {
    res.status(400).json({ error: "Incorrect code. Please check and try again." }); return;
  }
  smsOtpStore.delete(phone);
  await db
    .update(walletProfilesTable)
    .set({ smsPhoneNumber: phone, smsPhoneVerified: true })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  res.json({ verified: true, phoneNumber: phone });
});

// ─── Support chat ─────────────────────────────────────────────────────────────

router.get("/support/messages", async (req, res) => {
  const userId = getUserId(req);
  const [thread] = await db.select().from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId)).limit(1);
  if (!thread) { res.json({ threadId: null, messages: [] }); return; }
  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.threadId, thread.id))
    .orderBy(supportMessagesTable.createdAt);
  res.json({
    threadId: thread.id,
    messages: messages.map(m => ({
      id: m.id, threadId: m.threadId, senderRole: m.senderRole,
      content: m.content, createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/support/messages", async (req, res) => {
  const userId = getUserId(req);
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Message content is required." }); return; }
  let [thread] = await db.select().from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId)).limit(1);
  if (!thread) {
    [thread] = await db.insert(supportThreadsTable)
      .values({ clerkUserId: userId, status: "open" }).returning();
  }
  const [message] = await db.insert(supportMessagesTable)
    .values({ threadId: thread.id, senderRole: "user", content: content.trim() }).returning();
  await db.update(supportThreadsTable).set({ updatedAt: new Date() })
    .where(eq(supportThreadsTable.id, thread.id));
  res.json({ sent: true, messageId: message.id });
});

router.get("/admin/support", requireAdmin, async (_req, res) => {
  const threads = await db.select().from(supportThreadsTable)
    .orderBy(desc(supportThreadsTable.updatedAt));
  if (threads.length === 0) { res.json({ threads: [] }); return; }
  const userIds = threads.map(t => t.clerkUserId);
  const profiles = await db.select({
    clerkUserId: walletProfilesTable.clerkUserId,
    displayName: walletProfilesTable.displayName,
    email: walletProfilesTable.email,
  }).from(walletProfilesTable).where(inArray(walletProfilesTable.clerkUserId, userIds));
  const result = await Promise.all(threads.map(async (thread) => {
    const msgs = await db.select().from(supportMessagesTable)
      .where(eq(supportMessagesTable.threadId, thread.id))
      .orderBy(desc(supportMessagesTable.createdAt));
    const profile = profiles.find(p => p.clerkUserId === thread.clerkUserId);
    const unreadCount = msgs.filter(m =>
      m.senderRole === "user" && (!thread.adminLastReadAt || m.createdAt > thread.adminLastReadAt)
    ).length;
    const last = msgs[0];
    return {
      userId: thread.clerkUserId,
      displayName: profile?.displayName ?? "Unknown",
      email: profile?.email ?? "",
      threadId: thread.id,
      lastMessage: last?.content ?? "",
      lastMessageAt: (last?.createdAt ?? thread.createdAt).toISOString(),
      unreadCount,
    };
  }));
  res.json({ threads: result });
});

router.get("/admin/support/:userId", requireAdmin, async (req, res) => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] ?? "" : req.params.userId;
  const [thread] = await db.select().from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId)).limit(1);
  if (!thread) { res.json({ userId, displayName: "", email: "", threadId: 0, messages: [] }); return; }
  const [profile] = await db.select({
    displayName: walletProfilesTable.displayName,
    email: walletProfilesTable.email,
  }).from(walletProfilesTable).where(eq(walletProfilesTable.clerkUserId, userId)).limit(1);
  const messages = await db.select().from(supportMessagesTable)
    .where(eq(supportMessagesTable.threadId, thread.id))
    .orderBy(supportMessagesTable.createdAt);
  // Mark as read
  await db.update(supportThreadsTable).set({ adminLastReadAt: new Date() })
    .where(eq(supportThreadsTable.id, thread.id));
  res.json({
    userId,
    displayName: profile?.displayName ?? "Unknown",
    email: profile?.email ?? "",
    threadId: thread.id,
    messages: messages.map(m => ({
      id: m.id, threadId: m.threadId, senderRole: m.senderRole,
      content: m.content, createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/admin/support/:userId/reply", requireAdmin, async (req, res) => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] ?? "" : req.params.userId;
  const { content } = req.body as { content?: string };
  if (!content?.trim()) { res.status(400).json({ error: "Reply content is required." }); return; }
  let [thread] = await db.select().from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId)).limit(1);
  if (!thread) {
    [thread] = await db.insert(supportThreadsTable)
      .values({ clerkUserId: userId, status: "open" }).returning();
  }
  const [message] = await db.insert(supportMessagesTable)
    .values({ threadId: thread.id, senderRole: "admin", content: content.trim() }).returning();
  await db.update(supportThreadsTable)
    .set({ updatedAt: new Date(), adminLastReadAt: new Date() })
    .where(eq(supportThreadsTable.id, thread.id));
  res.json({ sent: true, messageId: message.id });
});

// ─── Admin middleware ────────────────────────────────────────────────────────

function requireAdmin(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  next: Parameters<Parameters<IRouter["get"]>[1]>[2],
) {
  const secret = process.env.ADMIN_SECRET;
  const provided = req.headers["x-admin-key"];
  if (!secret || provided !== secret) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

// ─── Admin: stats ────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [[{ totalUsers }], [{ pendingDeposits }], [{ pendingWithdrawals }], [{ pendingKyc }], [{ totalTransactions }]] =
    await Promise.all([
      db.select({ totalUsers: count() }).from(walletProfilesTable),
      db
        .select({ pendingDeposits: count() })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.type, "deposit"), eq(transactionsTable.status, "pending"))),
      db
        .select({ pendingWithdrawals: count() })
        .from(transactionsTable)
        .where(and(eq(transactionsTable.type, "withdrawal"), eq(transactionsTable.status, "pending"))),
      db
        .select({ pendingKyc: count() })
        .from(kycSubmissionsTable)
        .where(eq(kycSubmissionsTable.status, "pending")),
      db.select({ totalTransactions: count() }).from(transactionsTable),
    ]);
  res.json({ totalUsers, pendingDeposits, pendingWithdrawals, pendingKyc, totalTransactions });
});

// ─── Admin: users ────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (_req, res) => {
  const profiles = await db
    .select()
    .from(walletProfilesTable)
    .orderBy(desc(walletProfilesTable.createdAt));
  const result = await Promise.all(
    profiles.map(async (profile) => {
      const holdings = await db
        .select()
        .from(holdingsTable)
        .where(eq(holdingsTable.clerkUserId, profile.clerkUserId));
      const totalHoldings = holdings.reduce((sum, h) => sum + asNumber(h.value), 0);
      return {
        id: String(profile.id),
        clerkUserId: profile.clerkUserId,
        displayName: profile.displayName,
        email: profile.email,
        verificationStatus: profile.verificationStatus,
        referralCode: profile.referralCode,
        totalHoldings,
        createdAt: profile.createdAt.toISOString(),
      };
    }),
  );
  res.json(result);
});

router.get("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const [profile] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);
  if (!profile) { res.status(404).json({ error: "User not found" }); return; }

  const [holdings, transactions, kycRows] = await Promise.all([
    db.select().from(holdingsTable).where(eq(holdingsTable.clerkUserId, userId)),
    db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.clerkUserId, userId))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(50),
    db
      .select()
      .from(kycSubmissionsTable)
      .where(eq(kycSubmissionsTable.clerkUserId, userId))
      .orderBy(desc(kycSubmissionsTable.submittedAt))
      .limit(1),
  ]);

  const totalHoldings = holdings.reduce((sum, h) => sum + asNumber(h.value), 0);
  const kyc = kycRows[0] ? await enrichKyc(kycRows[0]) : null;

  res.json({
    id: String(profile.id),
    clerkUserId: profile.clerkUserId,
    displayName: profile.displayName,
    email: profile.email,
    verificationStatus: profile.verificationStatus,
    totalHoldings,
    createdAt: profile.createdAt.toISOString(),
    holdings: holdings.map((h) => ({
      symbol: h.symbol,
      name: h.name,
      amount: asNumber(h.amount),
      value: asNumber(h.value),
      allocation: asNumber(h.allocation),
      change24h: asNumber(h.change24h),
      color: h.color,
    })),
    transactions: transactions.map((tx) => ({
      id: String(tx.id),
      clerkUserId: tx.clerkUserId,
      displayName: profile.displayName,
      email: profile.email,
      type: tx.type,
      asset: tx.asset,
      amount: asNumber(tx.amount),
      status: tx.status,
      createdAt: tx.createdAt.toISOString(),
    })),
    kyc,
  });
});

// ─── Admin: transactions ─────────────────────────────────────────────────────

async function enrichTransaction(tx: typeof transactionsTable.$inferSelect) {
  const [profile] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, tx.clerkUserId))
    .limit(1);
  return {
    id: String(tx.id),
    clerkUserId: tx.clerkUserId,
    displayName: profile?.displayName ?? tx.clerkUserId,
    email: profile?.email ?? "",
    type: tx.type,
    asset: tx.asset,
    amount: asNumber(tx.amount),
    destination: tx.destination ?? "",
    txHash: tx.txHash ?? "",
    proofPath: tx.proofPath ?? "",
    status: tx.status,
    createdAt: tx.createdAt.toISOString(),
  };
}

router.get("/admin/transactions", requireAdmin, async (_req, res) => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt));
  res.json(await Promise.all(transactions.map(enrichTransaction)));
});

router.patch("/admin/transactions/:id/approve", requireAdmin, async (req, res) => {
  const txId = Number(req.params.id);
  const [tx] = await db
    .update(transactionsTable)
    .set({ status: "completed" })
    .where(eq(transactionsTable.id, txId))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  // Update matching activity status
  await db
    .update(activitiesTable)
    .set({ status: "completed" })
    .where(eq(activitiesTable.transactionId, txId));

  // For approved deposits: credit holdings AND trading account
  if (tx.type === "deposit") {
    const [existing] = await db
      .select()
      .from(holdingsTable)
      .where(
        and(
          eq(holdingsTable.clerkUserId, tx.clerkUserId),
          eq(holdingsTable.symbol, tx.asset),
        ),
      )
      .limit(1);
    const depositAmount = asNumber(tx.amount);

    if (existing) {
      const newAmount = asNumber(existing.amount) + depositAmount;
      const newValue = asNumber(existing.value) + depositAmount; // approximate; price-adjusted later
      await db
        .update(holdingsTable)
        .set({
          amount: String(newAmount),
          value: String(newValue),
        })
        .where(eq(holdingsTable.id, existing.id));
    } else {
      const assetDef = marketDefinitions.find((m) => m.symbol === tx.asset);
      await db.insert(holdingsTable).values({
        clerkUserId: tx.clerkUserId,
        symbol: tx.asset,
        name: assetDef?.name ?? tx.asset,
        amount: String(depositAmount),
        value: String(depositAmount),
        allocation: "0",
        change24h: "0",
        color: assetDef?.color ?? "#888888",
      });
    }

    // Credit the same amount into the user's trading account
    const [existingTrading] = await db
      .select()
      .from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, tx.clerkUserId))
      .limit(1);
    if (existingTrading) {
      await db
        .update(tradingAccountsTable)
        .set({
          balance: String(asNumber(existingTrading.balance) + depositAmount),
          updatedAt: new Date(),
        })
        .where(eq(tradingAccountsTable.clerkUserId, tx.clerkUserId));
    } else {
      await db.insert(tradingAccountsTable).values({
        clerkUserId: tx.clerkUserId,
        balance: String(depositAmount),
      });
    }
  }

  // For approved withdrawals: debit holdings
  if (tx.type === "withdrawal") {
    const [existing] = await db
      .select()
      .from(holdingsTable)
      .where(
        and(
          eq(holdingsTable.clerkUserId, tx.clerkUserId),
          eq(holdingsTable.symbol, tx.asset),
        ),
      )
      .limit(1);
    if (existing) {
      const newAmount = Math.max(0, asNumber(existing.amount) - asNumber(tx.amount));
      const newValue = Math.max(0, asNumber(existing.value) - asNumber(tx.amount));
      await db
        .update(holdingsTable)
        .set({ amount: String(newAmount), value: String(newValue) })
        .where(eq(holdingsTable.id, existing.id));
    }
  }

  res.json(await enrichTransaction(tx));
});

router.patch("/admin/transactions/:id/reject", requireAdmin, async (req, res) => {
  const txId = Number(req.params.id);
  const [tx] = await db
    .update(transactionsTable)
    .set({ status: "failed" })
    .where(eq(transactionsTable.id, txId))
    .returning();
  if (!tx) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  await db
    .update(activitiesTable)
    .set({ status: "failed" })
    .where(eq(activitiesTable.transactionId, txId));
  res.json(await enrichTransaction(tx));
});

// ─── Admin: KYC ──────────────────────────────────────────────────────────────

async function enrichKyc(kyc: typeof kycSubmissionsTable.$inferSelect) {
  const [profile] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, kyc.clerkUserId))
    .limit(1);
  return {
    id: String(kyc.id),
    clerkUserId: kyc.clerkUserId,
    displayName: profile?.displayName ?? kyc.clerkUserId,
    email: profile?.email ?? "",
    fullName: kyc.fullName,
    country: kyc.country,
    city: kyc.city ?? "",
    occupation: kyc.occupation ?? "",
    ssn: kyc.ssn ?? "",
    documentType: kyc.documentType,
    documentImageBase64: kyc.documentImageBase64 ?? undefined,
    status: kyc.status,
    submittedAt: kyc.submittedAt.toISOString(),
  };
}

router.get("/admin/kyc", requireAdmin, async (_req, res) => {
  const submissions = await db
    .select()
    .from(kycSubmissionsTable)
    .orderBy(desc(kycSubmissionsTable.submittedAt));
  res.json(await Promise.all(submissions.map(enrichKyc)));
});

router.patch("/admin/kyc/:id/approve", requireAdmin, async (req, res) => {
  const kycId = Number(req.params.id);
  const [kyc] = await db
    .update(kycSubmissionsTable)
    .set({ status: "verified" })
    .where(eq(kycSubmissionsTable.id, kycId))
    .returning();
  if (!kyc) {
    res.status(404).json({ error: "KYC not found" });
    return;
  }
  await db
    .update(walletProfilesTable)
    .set({ verificationStatus: "verified" })
    .where(eq(walletProfilesTable.clerkUserId, kyc.clerkUserId));
  res.json(await enrichKyc(kyc));
});

router.patch("/admin/kyc/:id/reject", requireAdmin, async (req, res) => {
  const kycId = Number(req.params.id);
  const [kyc] = await db
    .update(kycSubmissionsTable)
    .set({ status: "rejected" })
    .where(eq(kycSubmissionsTable.id, kycId))
    .returning();
  if (!kyc) {
    res.status(404).json({ error: "KYC not found" });
    return;
  }
  await db
    .update(walletProfilesTable)
    .set({ verificationStatus: "unverified" })
    .where(eq(walletProfilesTable.clerkUserId, kyc.clerkUserId));
  res.json(await enrichKyc(kyc));
});

// ─── Trading / Futures ────────────────────────────────────────────────────────

const TRADING_FALLBACK: Record<string, number> = {
  BTC: 67000, ETH: 3500, BNB: 580, SOL: 145, XRP: 0.52,
};

async function getOrCreateTradingAccount(userId: string) {
  let [acct] = await db.select().from(tradingAccountsTable)
    .where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1);
  if (!acct) {
    [acct] = await db.insert(tradingAccountsTable).values({ clerkUserId: userId }).returning();
  }
  return acct;
}

function mapTrade(t: typeof tradesTable.$inferSelect) {
  return {
    id: t.id, asset: t.asset, direction: t.direction, amount: Number(t.amount),
    timeframeSecs: t.timeframeSecs, status: t.status, result: t.result,
    adminOverride: t.adminOverride, entryPrice: Number(t.entryPrice),
    exitPrice: t.exitPrice ? Number(t.exitPrice) : null,
    payout: t.payout ? Number(t.payout) : null, payoutRate: Number(t.payoutRate),
    createdAt: t.createdAt.toISOString(), expiresAt: t.expiresAt.toISOString(),
    settledAt: t.settledAt?.toISOString() ?? null,
  };
}

async function autoSettleExpiredTrades(userId: string) {
  const active = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.clerkUserId, userId), eq(tradesTable.status, "active")));
  const now = new Date();
  for (const trade of active) {
    if (trade.expiresAt > now) continue;
    const entry = Number(trade.entryPrice);
    let outcome: "win" | "loss";
    let exitPrice: number;
    if (trade.adminOverride) {
      outcome = trade.adminOverride as "win" | "loss";
      exitPrice = outcome === "win"
        ? (trade.direction === "long" ? entry * 1.01 : entry * 0.99)
        : (trade.direction === "long" ? entry * 0.99 : entry * 1.01);
    } else {
      exitPrice = entry * (1 + (Math.random() * 0.04 - 0.02));
      const priceRose = exitPrice > entry;
      outcome = (trade.direction === "long") === priceRose ? "win" : "loss";
    }
    const payout = outcome === "win"
      ? Number(trade.amount) * Number(trade.payoutRate)
      : -Number(trade.amount);
    await db.update(tradesTable).set({
      status: "completed", result: outcome,
      exitPrice: String(exitPrice), payout: String(payout), settledAt: now,
    }).where(eq(tradesTable.id, trade.id));
    const acct = await getOrCreateTradingAccount(userId);
    const delta = outcome === "win" ? Number(trade.amount) * (1 + Number(trade.payoutRate)) : 0;
    await db.update(tradingAccountsTable).set({
      balance: String(Number(acct.balance) + delta),
      wins: outcome === "win" ? acct.wins + 1 : acct.wins,
      losses: outcome === "loss" ? acct.losses + 1 : acct.losses,
      updatedAt: now,
    }).where(eq(tradingAccountsTable.clerkUserId, userId));
  }
}

router.get("/trading/account", async (req, res) => {
  const userId = getUserId(req);
  const acct = await getOrCreateTradingAccount(userId);
  res.json({ balance: Number(acct.balance), totalTrades: acct.totalTrades, wins: acct.wins, losses: acct.losses });
});

router.get("/trading/trades", async (req, res) => {
  const userId = getUserId(req);
  await autoSettleExpiredTrades(userId);
  const trades = await db.select().from(tradesTable)
    .where(eq(tradesTable.clerkUserId, userId))
    .orderBy(desc(tradesTable.createdAt)).limit(50);
  res.json(trades.map(mapTrade));
});

router.post("/trading/trades", async (req, res) => {
  const userId = getUserId(req);
  const { asset, direction, amount, timeframeSecs } = req.body as {
    asset?: string; direction?: string; amount?: number; timeframeSecs?: number;
  };
  if (!asset || !direction || !amount || !timeframeSecs) {
    res.status(400).json({ error: "Missing required fields." }); return;
  }
  if (!["long", "short"].includes(direction)) {
    res.status(400).json({ error: "Invalid direction." }); return;
  }
  if (amount <= 0) { res.status(400).json({ error: "Amount must be positive." }); return; }
  const acct = await getOrCreateTradingAccount(userId);
  if (Number(acct.balance) < amount) {
    res.status(400).json({ error: "Insufficient balance." }); return;
  }
  let entryPrice: number;
  try {
    const assets = await fetchMarketAssets(req);
    const found = assets.find((a: { symbol: string; price: number }) => a.symbol === asset.toUpperCase());
    entryPrice = found?.price ?? TRADING_FALLBACK[asset.toUpperCase()] ?? 100;
  } catch {
    entryPrice = TRADING_FALLBACK[asset.toUpperCase()] ?? 100;
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeframeSecs * 1000);
  const [trade] = await db.insert(tradesTable).values({
    clerkUserId: userId, asset: asset.toUpperCase(), direction,
    amount: String(amount), timeframeSecs, entryPrice: String(entryPrice),
    expiresAt, payoutRate: "0.85",
  }).returning();
  const newBalance = Number(acct.balance) - amount;
  await db.update(tradingAccountsTable).set({
    balance: String(newBalance), totalTrades: acct.totalTrades + 1, updatedAt: now,
  }).where(eq(tradingAccountsTable.clerkUserId, userId));
  res.json({ tradeId: trade.id, balance: newBalance, entryPrice, expiresAt: trade.expiresAt.toISOString() });
});

router.get("/admin/trading/trades", requireAdmin, async (_req, res) => {
  const trades = await db.select().from(tradesTable)
    .orderBy(desc(tradesTable.createdAt)).limit(200);
  if (trades.length === 0) { res.json([]); return; }
  const userIds = [...new Set(trades.map(t => t.clerkUserId))];
  const profiles = await db.select({
    clerkUserId: walletProfilesTable.clerkUserId,
    displayName: walletProfilesTable.displayName,
    email: walletProfilesTable.email,
  }).from(walletProfilesTable).where(inArray(walletProfilesTable.clerkUserId, userIds));
  res.json(trades.map(t => {
    const p = profiles.find(pr => pr.clerkUserId === t.clerkUserId);
    return { ...mapTrade(t), clerkUserId: t.clerkUserId, displayName: p?.displayName ?? "Unknown", email: p?.email ?? "" };
  }));
});

router.get("/admin/trading/stats", requireAdmin, async (_req, res) => {
  const trades = await db.select().from(tradesTable);
  res.json({
    totalTrades: trades.length,
    activeTrades: trades.filter(t => t.status === "active").length,
    wins: trades.filter(t => t.result === "win").length,
    losses: trades.filter(t => t.result === "loss").length,
    totalVolume: trades.reduce((s, t) => s + Number(t.amount), 0),
  });
});

router.patch("/admin/trading/trades/:id/outcome", requireAdmin, async (req, res) => {
  const tradeId = Number(req.params.id);
  const { outcome } = req.body as { outcome?: string };
  if (!outcome || !["win", "loss"].includes(outcome)) {
    res.status(400).json({ error: "outcome must be 'win' or 'loss'." }); return;
  }
  const [trade] = await db.select().from(tradesTable).where(eq(tradesTable.id, tradeId)).limit(1);
  if (!trade) { res.status(404).json({ error: "Trade not found." }); return; }
  const now = new Date();
  if (trade.status === "active") {
    const entry = Number(trade.entryPrice);
    const rate = Number(trade.payoutRate);
    const exitPrice = outcome === "win"
      ? (trade.direction === "long" ? entry * 1.01 : entry * 0.99)
      : (trade.direction === "long" ? entry * 0.99 : entry * 1.01);
    const payout = outcome === "win" ? Number(trade.amount) * rate : -Number(trade.amount);
    await db.update(tradesTable).set({
      status: "completed", result: outcome, adminOverride: outcome,
      exitPrice: String(exitPrice), payout: String(payout), settledAt: now,
    }).where(eq(tradesTable.id, tradeId));
    const acct = await getOrCreateTradingAccount(trade.clerkUserId);
    const delta = outcome === "win" ? Number(trade.amount) * (1 + rate) : 0;
    await db.update(tradingAccountsTable).set({
      balance: String(Number(acct.balance) + delta),
      wins: outcome === "win" ? acct.wins + 1 : acct.wins,
      losses: outcome === "loss" ? acct.losses + 1 : acct.losses,
      updatedAt: now,
    }).where(eq(tradingAccountsTable.clerkUserId, trade.clerkUserId));
  } else {
    await db.update(tradesTable).set({ adminOverride: outcome }).where(eq(tradesTable.id, tradeId));
  }
  const [updated] = await db.select().from(tradesTable).where(eq(tradesTable.id, tradeId)).limit(1);
  const [profile] = await db.select({
    displayName: walletProfilesTable.displayName, email: walletProfilesTable.email,
  }).from(walletProfilesTable).where(eq(walletProfilesTable.clerkUserId, trade.clerkUserId)).limit(1);
  res.json({ ...mapTrade(updated), clerkUserId: updated.clerkUserId, displayName: profile?.displayName ?? "Unknown", email: profile?.email ?? "" });
});

export default router;