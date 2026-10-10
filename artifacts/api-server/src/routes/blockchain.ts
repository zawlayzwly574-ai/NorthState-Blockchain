import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { randomBytes, randomInt } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, desc, count, and, inArray, sql } from "drizzle-orm";
import { generateSecret as totpGenerateSecret, generateURI as totpGenerateURI, verifySync as totpVerifySync } from "otplib";
import {
  db,
  activitiesTable,
  futuresPositionsTable,
  holdingsTable,
  kycSubmissionsTable,
  miningInvestmentsTable,
  passkeysTable,
  supportMessagesTable,
  supportThreadsTable,
  tradesTable,
  tradingAccountsTable,
  transactionsTable,
  walletProfilesTable,
} from "@workspace/db";
import { createFuturesRouter, type FuturesQuote } from "./futures";
import { createFuturesQuoteFetcher, createMarketSnapshotFetcher, createTradingHistoryFetcher } from "./futures-quotes";
import { normalizeSmsE164 } from "../lib/phone";
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
  TransferTradingBalanceBody,
  TransferTradingBalanceResponse,
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
  category: "gold" | "energy" | "stock" | "oil";
  yahooSymbol: string;
  unit: string;
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
  status: "live" | "stale";
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
  { symbol: "XRP", name: "XRP", id: "ripple", color: "#23292F", rank: 8 },
  { symbol: "SOL", name: "Solana", id: "solana", color: "#9945FF", rank: 9 },
  { symbol: "TRX", name: "TRON", id: "tron", color: "#EF0027", rank: 10 },
  { symbol: "HYPE", name: "Hyperliquid", id: "hyperliquid", color: "#58D7BE", rank: 11 },
  { symbol: "ZEC", name: "Zcash", id: "zcash", color: "#ECB244", rank: 12 },
  { symbol: "DOGE", name: "Dogecoin", id: "dogecoin", color: "#C2A633", rank: 13 },
  { symbol: "LEO", name: "UNUS SED LEO", id: "leo-token", color: "#5B8DEF", rank: 14 },
  { symbol: "XMR", name: "Monero", id: "monero", color: "#F26822", rank: 15 },
  { symbol: "LINK", name: "Chainlink", id: "chainlink", color: "#2A5ADA", rank: 16 },
  { symbol: "ADA", name: "Cardano", id: "cardano", color: "#0033AD", rank: 17 },
  { symbol: "XLM", name: "Stellar", id: "stellar", color: "#7C8BA1", rank: 18 },
  { symbol: "BCH", name: "Bitcoin Cash", id: "bitcoin-cash", color: "#0AC18E", rank: 19 },
  { symbol: "CANTON", name: "Canton Network", id: "canton-network", color: "#5D6BFF", rank: 20 },
  { symbol: "USD1", name: "World Liberty Financial USD", id: "usd1-wlfi", color: "#71B7A4", rank: 21 },
  { symbol: "USDe", name: "Ethena USDe", id: "ethena-usde", color: "#6C63FF", rank: 22 },
  { symbol: "LTC", name: "Litecoin", id: "litecoin", color: "#345D9D", rank: 23 },
  { symbol: "TON", name: "Toncoin", id: "the-open-network", color: "#0098EA", rank: 24 },
  { symbol: "HBAR", name: "Hedera", id: "hedera-hashgraph", color: "#222222", rank: 25 },
  { symbol: "AVAX", name: "Avalanche", id: "avalanche-2", color: "#E84142", rank: 26 },
  { symbol: "SUI", name: "Sui", id: "sui", color: "#6FBCF0", rank: 27 },
  { symbol: "SHIB", name: "Shiba Inu", id: "shiba-inu", color: "#F00500", rank: 28 },
  { symbol: "UNI", name: "Uniswap", id: "uniswap", color: "#FF007A", rank: 29 },
  { symbol: "PYUSD", name: "PayPal USD", id: "paypal-usd", color: "#0070BA", rank: 30 },
  { symbol: "CRO", name: "Cronos", id: "crypto-com-chain", color: "#103F68", rank: 31 },
  { symbol: "XAUT", name: "Tether Gold", id: "tether-gold", color: "#D4AF37", rank: 32 },
  { symbol: "TAO", name: "Bittensor", id: "bittensor", color: "#7456FF", rank: 33 },
  { symbol: "NEAR", name: "NEAR Protocol", id: "near", color: "#111111", rank: 34 },
  { symbol: "M", name: "MemeCore", id: "memecore", color: "#E85D75", rank: 35 },
];

const miningPlaceDefinitions: MiningPlaceDefinition[] = [
  { symbol: "GOLD", name: "Gold", category: "gold", yahooSymbol: "GC=F", unit: "oz", color: "#d6ad3b" },
  { symbol: "XLE", name: "Energy Select Sector", category: "energy", yahooSymbol: "XLE", unit: "share", color: "#4dbb8a" },
  { symbol: "OIL", name: "Crude Oil", category: "oil", yahooSymbol: "CL=F", unit: "barrel", color: "#9d7b52" },
  { symbol: "AAPL", name: "Apple", category: "stock", yahooSymbol: "AAPL", unit: "share", color: "#b8c1cc" },
  { symbol: "TSLA", name: "Tesla", category: "stock", yahooSymbol: "TSLA", unit: "share", color: "#d86464" },
  { symbol: "NVDA", name: "Nvidia", category: "stock", yahooSymbol: "NVDA", unit: "share", color: "#76b900" },
  { symbol: "MSFT", name: "Microsoft", category: "stock", yahooSymbol: "MSFT", unit: "share", color: "#4a9fe3" },
  { symbol: "AMZN", name: "Amazon", category: "stock", yahooSymbol: "AMZN", unit: "share", color: "#e8a43a" },
];

let miningPlaceCache: { assets: MiningPlaceAsset[]; ts: number } | null = null;
let miningPlaceRefreshPromise: Promise<{ assets: MiningPlaceAsset[]; ts: number }> | null = null;
const MINING_PLACE_TTL = 3_000;
const MINING_PLACE_MAX_STALE_AGE = 7 * 24 * 60 * 60_000;
const YAHOO_FINANCE_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

function getUserId(req: Request) {
  const userId = getAuth(req).userId;
  if (!userId) throw new Error("Authentication required.");
  return userId;
}

type AccountOperationalStatus = "active" | "suspended" | "frozen";
const accountStatusKey = "accountStatus";
const accountStatusCache = new Map<string, { status: AccountOperationalStatus; expiresAt: number }>();
const ACCOUNT_STATUS_CACHE_TTL = 15_000;

async function getAccountOperationalStatus(userId: string): Promise<AccountOperationalStatus> {
  const cached = accountStatusCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.status;
  const user = await clerkClient.users.getUser(userId);
  const status = user.privateMetadata?.[accountStatusKey];
  const normalized = status === "suspended" || status === "frozen" ? status : "active";
  accountStatusCache.set(userId, { status: normalized, expiresAt: Date.now() + ACCOUNT_STATUS_CACHE_TTL });
  return normalized;
}

async function setAccountOperationalStatus(userId: string, status: AccountOperationalStatus) {
  const user = await clerkClient.users.getUser(userId);
  const privateMetadata = {
    ...(user.privateMetadata as Record<string, unknown>),
    [accountStatusKey]: status,
  };
  await clerkClient.users.updateUserMetadata(userId, { privateMetadata });
  accountStatusCache.set(userId, { status, expiresAt: Date.now() + ACCOUNT_STATUS_CACHE_TTL });
}

function isFrozenOperation(req: Request) {
  const protectedPaths = ["/portfolio", "/mining-investments", "/transactions", "/trading"];
  return protectedPaths.some((path) => req.path === path || req.path.startsWith(`${path}/`));
}

function requireMember(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/admin")) {
    next();
    return;
  }

  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  void getAccountOperationalStatus(userId)
    .then((status) => {
      if (status === "suspended" || (status === "frozen" && isFrozenOperation(req))) {
        res.status(403).json({
          error: status === "suspended"
            ? "This account is suspended."
            : "This account is frozen and cannot perform this operation.",
          accountStatus: status,
        });
        return;
      }
      next();
    })
    .catch(() => {
      res.status(503).json({ error: "Unable to verify account status. Please try again." });
    });
}

function asNumber(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function normalizeStablecoinAmount(rawAmount: string) {
  const match = /^(?:0|[1-9]\d*)(?:\.(\d{1,8}))?$/.exec(rawAmount);
  if (!match) return null;
  const [wholePart] = rawAmount.split(".");
  const fractionalPart = (match[1] ?? "").padEnd(8, "0");
  const scale = 100_000_000n;
  const units = BigInt(wholePart) * scale + BigInt(fractionalPart || "0");
  if (units <= 0n || units > 1_000_000_000n * scale) return null;
  return `${units / scale}.${(units % scale).toString().padStart(8, "0")}`;
}

function emailPrefix(email: string) {
  return email.trim().split("@")[0] || "Unknown user";
}

const DEFAULT_PORTFOLIO_BALANCE = "0";

// New accounts start with zero balance and no holdings/activity — everything
// after this point must come from a real, admin-approved deposit.
async function ensureDefaultPortfolio(userId: string, allowCreate: boolean) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [existingAccount] = await tx
      .select()
      .from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, userId))
      .limit(1);

    if (!existingAccount) {
      if (!allowCreate) {
        throw new Error(
          "This member is missing a persisted trading account. Reconcile the imported account before creating a balance.",
        );
      }
      // A newly created profile gets a persisted zero-balance account. Older
      // profiles are never assigned a synthetic balance during a normal read.
      await tx.insert(tradingAccountsTable).values({
        clerkUserId: userId,
        balance: DEFAULT_PORTFOLIO_BALANCE,
      }).onConflictDoNothing();
    }
  });
}

async function fetchClerkUserInfo(userId: string): Promise<{ email: string; name: string }> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    );
    const email = (primaryEmail ?? user.emailAddresses[0])?.emailAddress?.trim() ?? "";
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || "";
    return { email, name };
  } catch {
    throw new Error("Unable to retrieve the authenticated member profile from Clerk.");
  }
}

async function ensureSeededUser(
  userId: string,
  { syncClerkIdentity = false, profileOnly = false }: {
    syncClerkIdentity?: boolean;
    profileOnly?: boolean;
  } = {},
) {
  const [existing] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    const profileUpdate: Partial<typeof walletProfilesTable.$inferInsert> = {};
    if (
      syncClerkIdentity ||
      !existing.email.trim() ||
      existing.email === "member@northstateblockchain.app" ||
      !existing.displayName.trim() ||
      existing.displayName === "North State Blockchain Member"
    ) {
      const { email, name } = await fetchClerkUserInfo(userId);
      if (!email) throw new Error("The authenticated member has no email address in Clerk.");
      if (existing.email !== email) profileUpdate.email = email;
      if (
        !existing.displayName.trim() ||
        existing.displayName === "North State Blockchain Member" ||
        existing.displayName === emailPrefix(existing.email)
      ) {
        profileUpdate.displayName = name || emailPrefix(email);
      }
    }
    if (Object.keys(profileUpdate).length) {
      await db.update(walletProfilesTable).set(profileUpdate).where(eq(walletProfilesTable.clerkUserId, userId));
    }
    const accountRepairWindowMs = 24 * 60 * 60 * 1000;
    const recentlyCreated = Date.now() - existing.createdAt.getTime() <= accountRepairWindowMs;
    // An older imported account may be missing its trading row. Its identity
    // remains readable on Settings; financial routes still reject that gap.
    if (!profileOnly || recentlyCreated) {
      await ensureDefaultPortfolio(userId, recentlyCreated);
    }
    return { ...existing, ...profileUpdate };
  }

  const info = await fetchClerkUserInfo(userId);
  if (!info.email) throw new Error("The authenticated member has no email address in Clerk.");

  const [profile] = await db
    .insert(walletProfilesTable)
    .values({
      clerkUserId: userId,
      displayName: info.name || emailPrefix(info.email),
      email: info.email,
      referralCode: `NORTHSTAR-${userId.slice(-10).toUpperCase()}`,
      verificationStatus: "unverified",
      referralInvitedCount: 0,
      referralReward: "0",
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
    if (fetched) {
      const recentlyCreated = Date.now() - fetched.createdAt.getTime() <= 24 * 60 * 60 * 1000;
      if (!profileOnly || recentlyCreated) {
        await ensureDefaultPortfolio(userId, recentlyCreated);
      }
      return fetched;
    }
    throw new Error("Unable to load the persisted member profile.");
  }

  await ensureDefaultPortfolio(userId, true);

  return profile;
}

function isKycExemptMemberPath(path: string) {
  return [
    "/profile",
    "/user",
    "/kyc",
    "/referral",
    "/security",
    "/sms",
    "/support",
  ].some((allowedPath) => path === allowedPath || path.startsWith(`${allowedPath}/`));
}

async function requireVerifiedMember(req: Request, res: Response, next: NextFunction) {
  const unverifiedReadPath = req.method === "GET" && [
    "/portfolio",
    "/activity",
    "/notifications",
  ].some((path) => req.path === path || req.path.startsWith(`${path}/`));

  if (req.path.startsWith("/admin") || isKycExemptMemberPath(req.path) || unverifiedReadPath) {
    next();
    return;
  }

  const profile = await ensureSeededUser(getUserId(req));
  if (profile.verificationStatus !== "verified") {
    res.status(403).json({
      error: "KYC verification and admin approval are required before using member features.",
      verificationStatus: profile.verificationStatus,
    });
    return;
  }
  next();
}

const MARKET_API_KEY = process.env.MARKET_API_KEY?.trim() ?? "";
const MARKET_API_KEY_TYPE = (process.env.MARKET_API_KEY_TYPE ?? "demo").trim().toLowerCase();
type CoinGeckoAuthMode = "demo" | "pro";
const isCoinGeckoPro = Boolean(MARKET_API_KEY) &&
  ["pro", "paid", "enterprise"].includes(MARKET_API_KEY_TYPE);
let preferredCoinGeckoAuthMode: CoinGeckoAuthMode = isCoinGeckoPro ? "pro" : "demo";
let coinGeckoAuthBlockedUntil = 0;
let coinGeckoRateLimitedUntil = 0;

function coinGeckoBaseUrl(mode: CoinGeckoAuthMode) {
  return mode === "pro"
    ? "https://pro-api.coingecko.com/api/v3"
    : "https://api.coingecko.com/api/v3";
}

function coinGeckoHeaders(mode: CoinGeckoAuthMode): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (MARKET_API_KEY) {
    headers[mode === "pro" ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = MARKET_API_KEY;
  }
  return headers;
}

async function fetchCoinGeckoEndpoint(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
  path: string,
): Promise<Awaited<ReturnType<typeof fetch>> | null> {
  if (Date.now() < coinGeckoAuthBlockedUntil || Date.now() < coinGeckoRateLimitedUntil) return null;
  const modes: CoinGeckoAuthMode[] = MARKET_API_KEY
    ? [preferredCoinGeckoAuthMode, preferredCoinGeckoAuthMode === "pro" ? "demo" : "pro"]
    : [preferredCoinGeckoAuthMode];

  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const endpoint = `${coinGeckoBaseUrl(mode)}/${path}`;
    let response: Awaited<ReturnType<typeof fetch>>;
    try {
      response = await fetch(endpoint, {
        headers: coinGeckoHeaders(mode),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      req.log.warn({ err: error, host: new URL(endpoint).host }, "CoinGecko provider could not be reached");
      return null;
    }
    if (response.ok) {
      if (preferredCoinGeckoAuthMode !== mode) {
        req.log.info({ authMode: mode }, "CoinGecko alternate authentication mode succeeded");
      }
      preferredCoinGeckoAuthMode = mode;
      coinGeckoAuthBlockedUntil = 0;
      coinGeckoRateLimitedUntil = 0;
      return response;
    }

    const providerError = await response.clone().json().catch(() => null) as {
      status?: { error_message?: string };
      error?: string;
      message?: string;
    } | null;
    const details = {
      status: response.status,
      host: new URL(endpoint).host,
      authMode: mode,
      configuredKeyType: MARKET_API_KEY_TYPE || "unset",
      keyConfigured: Boolean(MARKET_API_KEY),
      providerError: providerError?.status?.error_message ?? providerError?.error ?? providerError?.message,
    };
    if (response.status === 429) {
      coinGeckoRateLimitedUntil = Date.now() + 60_000;
      req.log.warn(details, "CoinGecko rate limit reached; cooling down provider requests");
      return null;
    }
    if ([400, 401, 403].includes(response.status) && index < modes.length - 1) {
      req.log.warn(details, "CoinGecko auth mode rejected; retrying alternate documented mode");
      continue;
    }
    if ([400, 401, 403].includes(response.status)) coinGeckoAuthBlockedUntil = Date.now() + 60_000;
    req.log.warn(details, "CoinGecko provider returned a non-success status");
    return null;
  }
  return null;
}

const marketHeaders = coinGeckoHeaders(preferredCoinGeckoAuthMode);

type CoinPaprikaQuote = {
  price?: number;
  market_cap?: number;
  volume_24h?: number;
  percent_change_24h?: number;
};
type CoinPaprikaTicker = {
  id?: string;
  symbol?: string;
  name?: string;
  rank?: number;
  last_updated?: string;
  quotes?: { USD?: CoinPaprikaQuote };
};

let coinPaprikaCache: { tickers: CoinPaprikaTicker[]; ts: number } | null = null;
let coinPaprikaRefreshPromise: Promise<CoinPaprikaTicker[]> | null = null;
let coinPaprikaRetryAfter = 0;
const COINPAPRIKA_CACHE_TTL = 180_000;

async function fetchCoinPaprikaTickers(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
): Promise<CoinPaprikaTicker[]> {
  const now = Date.now();
  if (coinPaprikaCache && now - coinPaprikaCache.ts < COINPAPRIKA_CACHE_TTL) return coinPaprikaCache.tickers;
  if (now < coinPaprikaRetryAfter) return coinPaprikaCache?.tickers ?? [];
  if (!coinPaprikaRefreshPromise) {
    coinPaprikaRefreshPromise = (async () => {
      try {
        const response = await fetch("https://api.coinpaprika.com/v1/tickers?quotes=USD", {
          headers: { accept: "application/json", "user-agent": "NorthStateBlockchain/1.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          coinPaprikaRetryAfter = Date.now() + 60_000;
          req.log.warn({ status: response.status }, "CoinPaprika fallback returned a non-success status");
          return coinPaprikaCache?.tickers ?? [];
        }
        const tickers = await response.json() as CoinPaprikaTicker[];
        if (!Array.isArray(tickers)) {
          coinPaprikaRetryAfter = Date.now() + 60_000;
          req.log.warn({}, "CoinPaprika fallback returned an unexpected response");
          return coinPaprikaCache?.tickers ?? [];
        }
        coinPaprikaCache = { tickers, ts: Date.now() };
        coinPaprikaRetryAfter = 0;
        req.log.info({ tickerCount: tickers.length }, "CoinPaprika fallback ticker cache refreshed");
        return tickers;
      } catch (error) {
        coinPaprikaRetryAfter = Date.now() + 60_000;
        req.log.warn({ err: error }, "CoinPaprika fallback could not be reached");
        return coinPaprikaCache?.tickers ?? [];
      }
    })().finally(() => {
      coinPaprikaRefreshPromise = null;
    });
  }
  return coinPaprikaRefreshPromise;
}

function normalizeMarketName(value: string | undefined): string {
  return (value ?? "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function marketNameMatchScore(expected: string, actual: string | undefined): number {
  const left = normalizeMarketName(expected);
  const right = normalizeMarketName(actual);
  if (!left || !right) return 0;
  if (left === right) return 4;
  if (left.includes(right) || right.includes(left)) return 2;
  return 0;
}

async function fetchCoinPaprikaMarketData(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
): Promise<Record<string, MarketQuote>> {
  const tickers = await fetchCoinPaprikaTickers(req);
  const quotes: Record<string, MarketQuote> = {};
  for (const definition of marketDefinitions) {
    // CoinPaprika uses provider-specific symbols for two assets in our
    // supported list: Canton Network is CC and Toncoin is currently listed
    // as GRAM ("Gram (prev. Toncoin)"). The name-score below confirms these
    // aliases before using the quote.
    const providerSymbols = definition.id === "canton-network"
      ? ["CANTON", "CC"]
      : definition.id === "the-open-network"
        ? ["TON", "TONCOIN", "GRAM"]
        : [definition.symbol.toUpperCase()];
    const candidates = tickers
      .filter((ticker) =>
        providerSymbols.includes((ticker.symbol ?? "").toUpperCase()) &&
        Number.isFinite(ticker.quotes?.USD?.price) &&
        (ticker.quotes?.USD?.price ?? 0) > 0,
      )
      .map((ticker) => ({
        ticker,
        nameScore: marketNameMatchScore(definition.name, ticker.name),
        rank: Number.isFinite(ticker.rank) && (ticker.rank ?? 0) > 0
          ? ticker.rank!
          : Number.MAX_SAFE_INTEGER,
      }))
      .sort((a, b) => b.nameScore - a.nameScore || a.rank - b.rank);
    if (candidates.length === 0) continue;
    if (candidates.length > 1 && candidates[0].nameScore === 0) continue;
    const quote = candidates[0].ticker.quotes?.USD;
    if (!quote || !Number.isFinite(quote.price) || (quote.price ?? 0) <= 0) continue;
    const sourceTimestamp = Date.parse(candidates[0].ticker.last_updated ?? "");
    quotes[definition.id] = {
      usd: quote.price,
      usd_24h_change: quote.percent_change_24h,
      usd_market_cap: quote.market_cap,
      usd_24h_vol: quote.volume_24h,
      updatedAt: Number.isFinite(sourceTimestamp) ? sourceTimestamp : undefined,
    };
  }
  req.log.info({ supportedQuotes: Object.keys(quotes).length }, "CoinPaprika fallback quotes mapped");
  return quotes;
}

type MarketQuote = {
  usd?: number;
  usd_24h_change?: number;
  usd_market_cap?: number;
  usd_24h_vol?: number;
  updatedAt?: number;
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
  updatedAt: string | null;
};

type BinanceTicker = {
  symbol?: string;
  lastPrice?: string;
  priceChangePercent?: string;
  quoteVolume?: string;
  closeTime?: string | number;
};

const binanceSymbols: Record<string, string> = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  binancecoin: "BNBUSDT",
  "usd-coin": "USDCUSDT",
  dai: "DAIUSDT",
  "first-digital-usd": "FDUSDUSDT",
  ripple: "XRPUSDT",
  solana: "SOLUSDT",
  tron: "TRXUSDT",
  zcash: "ZECUSDT",
  dogecoin: "DOGEUSDT",
  chainlink: "LINKUSDT",
  cardano: "ADAUSDT",
  stellar: "XLMUSDT",
  "bitcoin-cash": "BCHUSDT",
  "usd1-wlfi": "USD1USDT",
  "ethena-usde": "USDEUSDT",
  litecoin: "LTCUSDT",
  "the-open-network": "TONUSDT",
  "hedera-hashgraph": "HBARUSDT",
  "avalanche-2": "AVAXUSDT",
  sui: "SUIUSDT",
  "shiba-inu": "SHIBUSDT",
  uniswap: "UNIUSDT",
  "tether-gold": "XAUTUSDT",
  bittensor: "TAOUSDT",
  near: "NEARUSDT",
};

// Spot and Futures execution both use recent provider-timestamped exchange trades.
// The public bulk snapshot is only for display; it is never an execution price.
const getFuturesQuote = createFuturesQuoteFetcher(marketDefinitions, binanceSymbols, marketHeaders);
const getTradingHistory = createTradingHistoryFetcher(marketDefinitions, binanceSymbols, marketHeaders);
const getExchangeMarketSnapshot = createMarketSnapshotFetcher(marketDefinitions);
const VALID_SPOT_TIMEFRAMES = new Set([60, 90, 120, 180, 300, 900, 1800, 3600, 86400, 259200, 864000, 1296000, 2592000]);
const isFreshExecutionQuote = (quote: FuturesQuote | null | undefined, now = Date.now()) =>
  !!quote && Number.isFinite(quote.price) && quote.price > 0 &&
  Number.isFinite(quote.updatedAt) && quote.updatedAt <= now + 2_000 &&
  now - quote.updatedAt <= 15_000;

function isValidMarketQuote(quote: MarketQuote | undefined) {
  return Number.isFinite(quote?.usd) && (quote?.usd ?? 0) > 0;
}

let marketCache: { assets: MarketAsset[]; ts: number } | null = null;
let marketRefreshPromise: Promise<MarketAsset[]> | null = null;
let binanceBlockedUntil = 0;
const MARKET_DATA_TTL = 750;

async function fetchBinanceMarketData(
  req: Parameters<Parameters<IRouter["get"]>[1]>[0],
) {
  if (Date.now() < binanceBlockedUntil) return {} as Record<string, MarketQuote>;
  const symbols = Object.values(binanceSymbols);
  const endpoint = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`;

  try {
    const response = await fetch(endpoint, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      if (response.status === 451) binanceBlockedUntil = Date.now() + 15 * 60_000;
      else if (response.status === 429) binanceBlockedUntil = Date.now() + 60_000;
      req.log.warn({ status: response.status }, "Alternate market provider returned a non-success status");
      return {} as Record<string, MarketQuote>;
    }

    const tickers = (await response.json()) as BinanceTicker[];
    return tickers.reduce<Record<string, MarketQuote>>((quotes, ticker) => {
      const marketId = Object.entries(binanceSymbols).find(([, symbol]) => symbol === ticker.symbol)?.[0];
      const price = Number(ticker.lastPrice);
      if (marketId && Number.isFinite(price) && price > 0) {
        const sourceTimestamp = Number(ticker.closeTime);
        quotes[marketId] = {
          usd: price,
          usd_24h_change: Number(ticker.priceChangePercent),
          usd_24h_vol: Number(ticker.quoteVolume),
          updatedAt: Number.isFinite(sourceTimestamp) && sourceTimestamp > 0 ? sourceTimestamp : undefined,
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
  let liveData: Record<string, MarketQuote> = {};

  // Exchange tickers are refreshed about once a second and drive the public
  // Markets table. Preserve market-cap data from the slower summary provider.
  try {
    const snapshot = await getExchangeMarketSnapshot(req);
    for (const definition of marketDefinitions) {
      const quote = snapshot[definition.symbol];
      if (isValidMarketQuote(quote)) {
        liveData[definition.id] = { ...liveData[definition.id], ...quote };
      }
    }
  } catch (error) {
    req.log.warn({ err: error }, "Exchange market snapshot could not be parsed");
  }

  let missingIds = marketDefinitions.some((definition) => !isValidMarketQuote(liveData[definition.id]));
  if (missingIds) {
    try {
      const response = await fetchCoinGeckoEndpoint(
        req,
        `simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true&include_last_updated_at=true`,
      );
      if (response) {
        const data = await response.json() as Record<string, MarketQuote & { last_updated_at?: number }>;
        for (const definition of marketDefinitions) {
          if (!isValidMarketQuote(liveData[definition.id]) && isValidMarketQuote(data[definition.id])) {
            const quote = data[definition.id];
            const sourceTimestamp = Number(quote.last_updated_at);
            liveData[definition.id] = {
              ...quote,
              updatedAt: Number.isFinite(sourceTimestamp) && sourceTimestamp > 0
                ? sourceTimestamp * 1000
                : undefined,
            };
          }
        }
      }
    } catch (error) {
      req.log.warn({ err: error }, "CoinGecko market quote response could not be parsed");
    }
  }

  missingIds = marketDefinitions.some((definition) => !isValidMarketQuote(liveData[definition.id]));
  if (missingIds) {
    const alternateData = await fetchBinanceMarketData(req);
    for (const definition of marketDefinitions) {
      if (!isValidMarketQuote(liveData[definition.id]) && isValidMarketQuote(alternateData[definition.id])) {
        liveData[definition.id] = alternateData[definition.id];
      }
    }
  }

  missingIds = marketDefinitions.some((definition) => !isValidMarketQuote(liveData[definition.id]));
  if (missingIds) {
    const fallbackData = await fetchCoinPaprikaMarketData(req);
    for (const definition of marketDefinitions) {
      const fallback = fallbackData[definition.id];
      if (!isValidMarketQuote(fallback)) continue;
      // Keep live exchange prices/changes where available, while retaining
      // market cap and other metadata from the slower public summary feed.
      liveData[definition.id] = {
        ...fallback,
        ...liveData[definition.id],
      };
    }
  }

  const previousAssets = new Map(marketCache?.assets.map((asset) => [asset.symbol, asset]));

  // Keep the complete supported-asset directory visible even when both quote
  // providers are unavailable. Never invent prices: use the last good quote
  // when available, otherwise return zero so the UI can label the quote as
  // unavailable instead of silently removing the asset or showing a fake price.
  return marketDefinitions.map((definition): MarketAsset => {
    const provider = liveData[definition.id];
    const previous = previousAssets.get(definition.symbol);
    if (!isValidMarketQuote(provider)) {
      return previous ?? {
        symbol: definition.symbol,
        name: definition.name,
        price: 0,
        change24h: 0,
        marketCap: 0,
        volume24h: 0,
        rank: definition.rank,
        color: definition.color,
        updatedAt: null,
      };
    }

    return {
      symbol: definition.symbol,
      name: definition.name,
      price: Number(provider!.usd),
      change24h: Number.isFinite(provider.usd_24h_change)
        ? provider.usd_24h_change!
        : previous?.change24h ?? 0,
      marketCap: Number.isFinite(provider.usd_market_cap)
        ? provider.usd_market_cap!
        : previous?.marketCap ?? 0,
      volume24h: Number.isFinite(provider.usd_24h_vol)
        ? provider.usd_24h_vol!
        : previous?.volume24h ?? 0,
      rank: definition.rank,
      color: definition.color,
      updatedAt: Number.isFinite(provider.updatedAt) && provider.updatedAt! > 0
        ? new Date(provider.updatedAt!).toISOString()
        : previous?.updatedAt ?? null,
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
        const previous = previousAssets.get(definition.symbol);
        const change24h = Number.isFinite(previousClose) && previousClose > 0
          ? ((price - previousClose) / previousClose) * 100
          : previous?.change24h ?? 0;
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
        && Number.isFinite(previousTimestamp)
        && now - previousTimestamp <= MINING_PLACE_MAX_STALE_AGE
      ) {
        return { ...previous, status: "stale" };
      }
      throw new Error(`No live or recent cached quote is available for ${definition.symbol}; refusing to publish a fabricated price.`);
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

  let chart: { time: string; value: number }[] = [];
  try {
    const history = await getTradingHistory(req, asset.symbol);
    chart = history.slice(-80).map(({ t, price }) => ({
      time: new Date(t).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }),
      value: price,
    }));
  } catch (error) {
    req.log.warn({ err: error, symbol: asset.symbol }, "Live market chart history unavailable");
  }

  res.json(GetMarketDetailResponse.parse({ asset, chart }));
});

// Everything after the public market endpoints belongs to the signed-in member
// area. Admin routes opt out here and enforce their own admin secret below.
router.use(requireMember);
router.use((req, res, next) => {
  void requireVerifiedMember(req, res, next).catch((error) => next(error));
});

router.use(createFuturesRouter(getFuturesQuote, getTradingHistory));

router.get("/profile", async (req, res) => {
  const profile = await ensureSeededUser(getUserId(req), { syncClerkIdentity: true, profileOnly: true });
  res.json(GetProfileResponse.parse({
    id: String(profile.id),
    name: profile.displayName,
    email: profile.email,
    initials: profile.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    verificationStatus: profile.verificationStatus,
    referralCode: profile.referralCode,
    twoFactorEnabled: profile.twoFactorEnabled ?? false,
    smsPhoneNumber: profile.smsPhoneNumber ?? null,
    smsPhoneVerified: profile.smsPhoneVerified ?? false,
  }));
});

// Backwards-compatible profile alias used by older clients.
router.get("/user", async (req, res) => {
  const profile = await ensureSeededUser(getUserId(req), { syncClerkIdentity: true, profileOnly: true });
  res.json(GetProfileResponse.parse({
    id: String(profile.id),
    name: profile.displayName,
    email: profile.email,
    initials: profile.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    verificationStatus: profile.verificationStatus,
    referralCode: profile.referralCode,
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
  await ensureSeededUser(userId, { profileOnly: true });
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
  await autoSettleExpiredTrades(userId, req);
  const account = await requireTradingAccount(userId);
  const holdings = await db.select().from(holdingsTable).where(eq(holdingsTable.clerkUserId, userId));
  const spotValue = asNumber(account.balance);
  const value = spotValue + asNumber(account.futuresBalance);
  const holdingsValue = holdings.reduce((total, holding) => total + asNumber(holding.value), 0);
  const dayChange = holdings.reduce(
    (total, holding) => total + (asNumber(holding.value) * asNumber(holding.change24h)) / 100,
    0,
  );
  res.json(GetPortfolioResponse.parse({
    totalValue: value,
    dayChange,
    dayChangePercent: value ? (dayChange / value) * 100 : 0,
    cashBalance: Math.max(0, spotValue - holdingsValue),
    // No portfolio snapshot table exists yet. Do not manufacture history from
    // the current balance; only persisted snapshots may populate this chart.
    history: [],
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

const miningInvestmentSymbols = new Set(miningPlaceDefinitions.map((asset) => asset.symbol));

function investmentQuote(symbol: string) {
  const cached = miningPlaceCache?.assets.find((asset) => asset.symbol === symbol);
  const definition = miningPlaceDefinitions.find((asset) => asset.symbol === symbol)!;
  return cached ?? {
    symbol: definition.symbol,
    name: definition.name,
    category: definition.category,
    price: definition.fallbackPrice,
    change24h: definition.fallbackChange,
    currency: "USD",
    unit: definition.unit,
    status: "fallback" as const,
    updatedAt: new Date().toISOString(),
    color: definition.color,
  };
}

function serializeInvestment(investment: typeof miningInvestmentsTable.$inferSelect) {
  const amount = asNumber(investment.approvedAmount ?? investment.requestedAmount);
  const currentValue = asNumber(investment.currentValue);
  return {
    id: String(investment.id),
    symbol: investment.symbol,
    assetName: investment.assetName,
    category: investment.category,
    requestedAmount: asNumber(investment.requestedAmount),
    approvedAmount: investment.approvedAmount == null ? null : asNumber(investment.approvedAmount),
    units: investment.units == null ? null : asNumber(investment.units),
    entryPrice: asNumber(investment.entryPrice),
    currentValue,
    gainLoss: investment.status === "active" ? currentValue - amount : 0,
    status: investment.status,
    adminNote: investment.adminNote ?? "",
    createdAt: investment.createdAt.toISOString(),
    reviewedAt: investment.reviewedAt?.toISOString() ?? null,
    updatedAt: investment.updatedAt.toISOString(),
  };
}

async function getAvailableUsdc(userId: string) {
  const [holding] = await db.select().from(holdingsTable).where(
    and(eq(holdingsTable.clerkUserId, userId), eq(holdingsTable.symbol, "USDC")),
  ).limit(1);
  const pending = await db.select().from(miningInvestmentsTable).where(
    and(eq(miningInvestmentsTable.clerkUserId, userId), eq(miningInvestmentsTable.status, "pending")),
  );
  const reserved = pending.reduce((sum, investment) => sum + asNumber(investment.approvedAmount ?? investment.requestedAmount), 0);
  return { holding, balance: Math.max(0, asNumber(holding?.amount) - reserved) };
}

router.get("/mining-investments", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const [investments, usdc] = await Promise.all([
    db.select().from(miningInvestmentsTable)
      .where(eq(miningInvestmentsTable.clerkUserId, userId))
      .orderBy(desc(miningInvestmentsTable.createdAt)),
    getAvailableUsdc(userId),
  ]);
  res.json({ investments: investments.map(serializeInvestment), availableUsdc: usdc.balance });
});

router.post("/mining-investments", async (req, res) => {
  const userId = getUserId(req);
  const symbol = String(req.body?.symbol ?? "").toUpperCase();
  const amount = Number(req.body?.amount);
  if (!miningInvestmentSymbols.has(symbol)) {
    res.status(400).json({ error: "That Mining Place asset is not available for investment." });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    res.status(400).json({ error: "Investment amount must be a positive USDC amount." });
    return;
  }
  await ensureSeededUser(userId);
  const quote = investmentQuote(symbol);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`
      select id from ${holdingsTable}
      where ${holdingsTable.clerkUserId} = ${userId}
        and ${holdingsTable.symbol} = 'USDC'
      for update
    `);
    const [holding] = await tx.select().from(holdingsTable).where(
      and(eq(holdingsTable.clerkUserId, userId), eq(holdingsTable.symbol, "USDC")),
    ).limit(1);
    const pending = await tx.select().from(miningInvestmentsTable).where(
      and(eq(miningInvestmentsTable.clerkUserId, userId), eq(miningInvestmentsTable.status, "pending")),
    );
    const reserved = pending.reduce(
      (sum, investment) => sum + asNumber(investment.approvedAmount ?? investment.requestedAmount),
      0,
    );
    const available = Math.max(0, asNumber(holding?.amount) - reserved);
    if (available < amount) return { investment: null, available };
    const [investment] = await tx.insert(miningInvestmentsTable).values({
      clerkUserId: userId,
      symbol,
      assetName: quote.name,
      category: quote.category,
      requestedAmount: amount.toFixed(8),
      units: (amount / quote.price).toFixed(12),
      entryPrice: quote.price.toFixed(8),
      currentValue: "0",
      status: "pending",
    }).returning();
    return { investment, available: available - amount };
  });
  if (!result.investment) {
    res.status(409).json({ error: `Insufficient available USDC. You have ${result.available.toFixed(2)} USDC available.` });
    return;
  }
  const investment = result.investment;
  res.status(201).json(serializeInvestment(investment));
});

router.get("/admin/mining-investments", requireAdmin, async (_req, res) => {
  const investments = await db.select().from(miningInvestmentsTable).orderBy(desc(miningInvestmentsTable.createdAt));
  const profiles = await db.select().from(walletProfilesTable);
  const profileById = new Map(profiles.map((profile) => [profile.clerkUserId, profile]));
  res.json(investments.map((investment) => ({
    ...serializeInvestment(investment),
    clerkUserId: investment.clerkUserId,
    displayName: profileById.get(investment.clerkUserId)?.displayName ?? investment.clerkUserId,
    email: profileById.get(investment.clerkUserId)?.email ?? "",
  })));
});

router.patch("/admin/mining-investments/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(miningInvestmentsTable).where(eq(miningInvestmentsTable.id, id)).limit(1);
  if (!existing) { res.status(404).json({ error: "Mining investment not found" }); return; }
  const updates: Partial<typeof miningInvestmentsTable.$inferInsert> = { updatedAt: new Date() };
  if (req.body?.approvedAmount !== undefined) {
    const approvedAmount = Number(req.body.approvedAmount);
    if (existing.status !== "pending" || !Number.isFinite(approvedAmount) || approvedAmount <= 0) {
      res.status(400).json({ error: "Only pending investments may receive a positive approved amount." }); return;
    }
    const adjusted = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select id from ${holdingsTable}
        where ${holdingsTable.clerkUserId} = ${existing.clerkUserId}
          and ${holdingsTable.symbol} = 'USDC'
        for update
      `);
      const [holding] = await tx.select().from(holdingsTable).where(and(
        eq(holdingsTable.clerkUserId, existing.clerkUserId),
        eq(holdingsTable.symbol, "USDC"),
      )).limit(1);
      const pending = await tx.select().from(miningInvestmentsTable).where(and(
        eq(miningInvestmentsTable.clerkUserId, existing.clerkUserId),
        eq(miningInvestmentsTable.status, "pending"),
      ));
      const otherReservations = pending
        .filter((investment) => investment.id !== existing.id)
        .reduce((sum, investment) => sum + asNumber(investment.approvedAmount ?? investment.requestedAmount), 0);
      if (asNumber(holding?.amount) - otherReservations < approvedAmount) return null;
      const [investment] = await tx.update(miningInvestmentsTable).set({
        approvedAmount: approvedAmount.toFixed(8),
        adminNote: typeof req.body?.adminNote === "string" ? req.body.adminNote.trim().slice(0, 1000) : existing.adminNote,
        updatedAt: new Date(),
      }).where(and(eq(miningInvestmentsTable.id, id), eq(miningInvestmentsTable.status, "pending"))).returning();
      return investment;
    });
    if (!adjusted) {
      res.status(409).json({ error: "The adjusted amount exceeds the user's available USDC." });
      return;
    }
    res.json(serializeInvestment(adjusted));
    return;
  }
  if (req.body?.currentValue !== undefined) {
    const currentValue = Number(req.body.currentValue);
    if (existing.status !== "active" || !Number.isFinite(currentValue) || currentValue < 0) {
      res.status(400).json({ error: "Only active investments may receive a non-negative current value." }); return;
    }
    updates.currentValue = currentValue.toFixed(8);
  }
  if (req.body?.adminNote !== undefined) {
    if (typeof req.body.adminNote !== "string" || req.body.adminNote.length > 1000) {
      res.status(400).json({ error: "Admin note must be 1,000 characters or fewer." }); return;
    }
    updates.adminNote = req.body.adminNote.trim();
  }
  const [investment] = await db.update(miningInvestmentsTable).set(updates).where(eq(miningInvestmentsTable.id, id)).returning();
  res.json(serializeInvestment(investment));
});

router.post("/admin/mining-investments/:id/approve", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const result = await db.transaction(async (tx) => {
    const [current] = await tx.update(miningInvestmentsTable)
      .set({ status: "processing", updatedAt: new Date() })
      .where(and(eq(miningInvestmentsTable.id, id), eq(miningInvestmentsTable.status, "pending")))
      .returning();
    if (!current) return null;
    const amount = asNumber(current.approvedAmount ?? current.requestedAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Investment amount is invalid.");
    const [holding] = await tx.update(holdingsTable).set({
      amount: sql`${holdingsTable.amount} - ${amount}`,
      value: sql`${holdingsTable.value} - ${amount}`,
    }).where(and(
      eq(holdingsTable.clerkUserId, current.clerkUserId),
      eq(holdingsTable.symbol, "USDC"),
      sql`${holdingsTable.amount} >= ${amount}`,
    )).returning();
    if (!holding) throw new Error("Insufficient available USDC to approve this investment.");
    const [approved] = await tx.update(miningInvestmentsTable).set({
      status: "active",
      approvedAmount: amount.toFixed(8),
      units: (amount / asNumber(current.entryPrice)).toFixed(12),
      currentValue: amount.toFixed(8),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(miningInvestmentsTable.id, id), eq(miningInvestmentsTable.status, "processing"))).returning();
    if (!approved) throw new Error("Investment settlement could not be completed.");
    return approved;
  });
  if (!result) { res.status(409).json({ error: "Investment is no longer pending." }); return; }
  res.json(serializeInvestment(result));
});

router.post("/admin/mining-investments/:id/reject", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [investment] = await db.update(miningInvestmentsTable).set({
    status: "rejected",
    adminNote: typeof req.body?.adminNote === "string" ? req.body.adminNote.trim().slice(0, 1000) : undefined,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(miningInvestmentsTable.id, id), eq(miningInvestmentsTable.status, "pending"))).returning();
  if (!investment) { res.status(409).json({ error: "Investment is no longer pending." }); return; }
  res.json(serializeInvestment(investment));
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
    code: "NORTHSTAR-ALEX",
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
    code: "NORTHSTAR-ALEX",
    invitedCount: profile.referralInvitedCount,
    reward: asNumber(profile.referralReward),
    shareUrl: `${req.protocol}://${req.get("host")}/join/${profile.referralCode}`,
  }));
});

// Recognize the document payload's declared image type and confirm its
// magic bytes actually match — accepts any common image format the client
// composed the ID photos into, instead of requiring JPEG specifically.
function detectImageSignature(bytes: Buffer): "jpeg" | "png" | "webp" | "gif" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "png";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return "webp";
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) return "gif";
  return null;
}

router.post("/kyc", async (req, res) => {
  const parsedBody = SubmitKycBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({
      error: "Check all personal details and upload two valid ID photos. The combined document must be under 100 MB.",
    });
    return;
  }
  const body = parsedBody.data;
  const declaredMimeMatch = body.documentImageBase64.match(/^data:image\/(jpeg|png|webp|gif);base64,/);
  const declaredMime = declaredMimeMatch?.[1] as "jpeg" | "png" | "webp" | "gif" | undefined;
  const encodedDocument = body.documentImageBase64.slice(declaredMimeMatch?.[0].length ?? 0);
  const normalizedDocument = encodedDocument.replace(/=+$/, "");
  const documentBytes = Buffer.from(encodedDocument, "base64");
  const normalizedDecodedDocument = documentBytes.toString("base64").replace(/=+$/, "");
  const actualFormat = detectImageSignature(documentBytes);
  if (!declaredMime || !actualFormat || actualFormat !== declaredMime || normalizedDecodedDocument !== normalizedDocument) {
    res.status(400).json({ error: "A valid combined ID document image is required." });
    return;
  }
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const submission = await db.transaction(async (transaction) => {
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:KYC`}))`);
    const [created] = await transaction.insert(kycSubmissionsTable).values({
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
    await transaction.update(walletProfilesTable)
      .set({ verificationStatus: "pending" })
      .where(eq(walletProfilesTable.clerkUserId, userId));
    return created;
  });
  res.status(201).json(SubmitKycResponse.parse({
    success: true,
    status: submission.status,
    submittedAt: submission.submittedAt.toISOString(),
  }));
});

async function createTransaction(
  req: Request,
  type: "deposit" | "send" | "withdrawal",
  body: {
    asset: string;
    amount: number;
    destination?: string;
    txHash?: string;
    proofPath?: string | null;
  },
) {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const transaction = await db.transaction(async (tx) => {
    const [created] = await tx.insert(transactionsTable).values({
      clerkUserId: userId,
      type,
      asset: body.asset,
      amount: String(body.amount),
      destination: body.destination ?? null,
      txHash: body.txHash?.trim() || null,
      proofPath: body.proofPath?.trim() || null,
      status: "pending",
    }).returning();
    await tx.insert(activitiesTable).values({
      clerkUserId: userId,
      type,
      asset: body.asset,
      amount: String(body.amount),
      value: String(body.amount),
      status: "pending",
      transactionId: created.id,
    });
    return created;
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
  const data = await createTransaction(req, "deposit", body);
  res.status(201).json(CreateDepositResponse.parse(data));
});

router.post("/transactions/send", async (req, res) => {
  const body = CreateSendBody.parse(req.body);
  const data = await createTransaction(req, "send", body);
  res.status(201).json(CreateSendResponse.parse(data));
});

router.post("/transactions/withdraw", async (req, res) => {
  const body = CreateWithdrawalBody.parse(req.body);
  const data = await createTransaction(req, "withdrawal", body);
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
type SmsOtpEntry = { code: string; expires: number; userId: string; attempts: number };
const smsOtpStore = new Map<string, SmsOtpEntry>();
const smsOtpSentAt = new Map<string, number>();
const smsOtpKey = (userId: string, phone: string) => `${userId}:${phone}`;


setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of smsOtpStore) {
    if (entry.expires < now) smsOtpStore.delete(key);
  }
  for (const [key, sentAt] of smsOtpSentAt) {
    if (now - sentAt > 10 * 60_000) smsOtpSentAt.delete(key);
  }
}, 120_000);

router.post("/sms/send-otp", async (req, res) => {
  const userId = getUserId(req);
  const { phoneNumber } = req.body as { phoneNumber?: string };
  const phone = normalizeSmsE164(phoneNumber);
  if (!phone) {
    res.status(400).json({ error: "Enter a valid international phone number in E.164 format, including the + country code." });
    return;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (!accountSid || !authToken || !fromNumber) {
    res.status(503).json({ error: "SMS service is not configured. Please contact support." });
    return;
  }

  const key = smsOtpKey(userId, phone);
  const lastSentAt = smsOtpSentAt.get(key) ?? 0;
  const waitSeconds = Math.ceil((60_000 - (Date.now() - lastSentAt)) / 1000);
  if (waitSeconds > 0) {
    res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another code.`, retryAfterSeconds: waitSeconds });
    return;
  }

  const code = String(randomInt(100000, 1_000_000));
  try {
    const { default: twilio } = await import("twilio");
    const client = twilio(accountSid, authToken);
    await client.messages.create({
      body: `Your North State Blockchain verification code is ${code}. Valid for 5 minutes. Do not share this code.`,
      from: fromNumber,
      to: phone,
    });
    const expires = Date.now() + 5 * 60_000;
    smsOtpStore.set(key, { code, expires, userId, attempts: 0 });
    smsOtpSentAt.set(key, Date.now());
    res.json({ sent: true, expiresAt: new Date(expires).toISOString() });
  } catch {
    req.log.warn({ userId, phonePrefix: phone.slice(0, 4) }, "SMS OTP delivery failed");
    res.status(502).json({ error: "The SMS provider could not deliver the verification code. Check the number and try again." });
  }
});

router.post("/sms/verify-otp", async (req, res) => {
  const userId = getUserId(req);
  const { phoneNumber, code } = req.body as { phoneNumber?: string; code?: string };
  const phone = normalizeSmsE164(phoneNumber);
  const otp = String(code ?? "").trim();
  if (!phone || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: "Enter a valid international phone number and the 6-digit verification code." });
    return;
  }

  const key = smsOtpKey(userId, phone);
  const entry = smsOtpStore.get(key);
  if (!entry || entry.expires < Date.now()) {
    smsOtpStore.delete(key);
    res.status(400).json({ error: "Code has expired. Please request a new one." });
    return;
  }
  if (entry.attempts >= 5) {
    smsOtpStore.delete(key);
    res.status(429).json({ error: "Too many incorrect codes. Please request a new code." });
    return;
  }
  if (entry.code !== otp) {
    entry.attempts += 1;
    res.status(400).json({ error: "Incorrect code. Please check and try again." });
    return;
  }

  smsOtpStore.delete(key);
  await db
    .update(walletProfilesTable)
    .set({ smsPhoneNumber: phone, smsPhoneVerified: true })
    .where(eq(walletProfilesTable.clerkUserId, userId));
  res.json({ verified: true, phoneNumber: phone });
});

// ─── Support chat ─────────────────────────────────────────────────────────────

// Public pre-login contact form. Messages are stored in the existing support inbox so
// the admin team can respond without changing existing account or wallet data.
const publicSupportAttempts = new Map<string, { count: number; resetAt: number }>();
const guestSupportIdPattern = /^guest_[a-f0-9]{36}$/;
router.post("/support/public-message", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!name || name.length > 100) {
    res.status(400).json({ error: "Please enter your name (up to 100 characters)." });
    return;
  }
  if (!content || content.length > 5000) {
    res.status(400).json({ error: "Please enter a message (up to 5,000 characters)." });
    return;
  }

  const now = Date.now();
  const clientKey = req.ip || req.socket.remoteAddress || "unknown";
  const previous = publicSupportAttempts.get(clientKey);
  if (previous && previous.resetAt > now && previous.count >= 5) {
    res.status(429).json({ error: "Too many messages. Please try again later." });
    return;
  }
  publicSupportAttempts.set(clientKey, previous && previous.resetAt > now
    ? { count: previous.count + 1, resetAt: previous.resetAt }
    : { count: 1, resetAt: now + 60 * 60 * 1000 });

  try {
    const guestId = `guest_${randomBytes(18).toString("hex")}`;
    const [thread] = await db.insert(supportThreadsTable)
      .values({ clerkUserId: guestId, status: "open" }).returning();
    await db.insert(supportMessagesTable).values({
      threadId: thread.id,
      senderRole: "user",
      content: `Guest support request\nName: ${name}\n\n${content}`,
    });
    await db.update(supportThreadsTable).set({ updatedAt: new Date() })
      .where(eq(supportThreadsTable.id, thread.id));
    res.status(201).json({ sent: true, guestId, threadId: thread.id });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to save public support message");
    res.status(503).json({ error: "Support is temporarily unavailable. Your message was not sent; please try again shortly." });
  }
});

// Guest IDs are random 144-bit bearer credentials returned only to the browser that
// created the thread. This enables an in-app follow-up conversation without email
// or a schema change. Do not expose these IDs in public thread listings.
router.get("/support/guest/:guestId", async (req, res) => {
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] ?? "" : req.params.guestId;
  if (!guestSupportIdPattern.test(guestId)) { res.status(404).json({ error: "Support conversation not found." }); return; }
  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.clerkUserId, guestId)).limit(1);
  if (!thread) { res.status(404).json({ error: "Support conversation not found." }); return; }
  const messages = await db.select().from(supportMessagesTable).where(eq(supportMessagesTable.threadId, thread.id)).orderBy(supportMessagesTable.createdAt);
  res.json({ threadId: thread.id, messages: messages.map(m => ({ id: m.id, senderRole: m.senderRole, content: m.content, createdAt: m.createdAt.toISOString() })) });
});

router.post("/support/guest/:guestId/messages", async (req, res) => {
  const guestId = Array.isArray(req.params.guestId) ? req.params.guestId[0] ?? "" : req.params.guestId;
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!guestSupportIdPattern.test(guestId)) { res.status(404).json({ error: "Support conversation not found." }); return; }
  if (!content || content.length > 5000) { res.status(400).json({ error: "Please enter a message (up to 5,000 characters)." }); return; }
  const [thread] = await db.select().from(supportThreadsTable).where(eq(supportThreadsTable.clerkUserId, guestId)).limit(1);
  if (!thread) { res.status(404).json({ error: "Support conversation not found." }); return; }
  const now = Date.now();
  const clientKey = `${req.ip || req.socket.remoteAddress || "unknown"}:${guestId}`;
  const previous = publicSupportAttempts.get(clientKey);
  if (previous && previous.resetAt > now && previous.count >= 20) { res.status(429).json({ error: "Too many messages. Please try again later." }); return; }
  publicSupportAttempts.set(clientKey, previous && previous.resetAt > now ? { count: previous.count + 1, resetAt: previous.resetAt } : { count: 1, resetAt: now + 60 * 60 * 1000 });
  try {
    const [message] = await db.insert(supportMessagesTable).values({ threadId: thread.id, senderRole: "user", content }).returning();
    await db.update(supportThreadsTable).set({ updatedAt: new Date() }).where(eq(supportThreadsTable.id, thread.id));
    res.status(201).json({ sent: true, messageId: message.id });
  } catch (error) {
    req.log?.error({ err: error }, "Unable to save guest support reply");
    res.status(503).json({ error: "Support is temporarily unavailable. Your message was not sent; please try again shortly." });
  }
});

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

function publicSupportDisplayContent(content: string) {
  return content.replace(/^Guest support request\nName: [^\n]*\n\n/, "");
}
function publicSupportName(messages: Array<{ content: string; senderRole: string }>) {
  const first = messages.find(message => message.senderRole === "user" && message.content.startsWith("Guest support request\n"));
  return first?.content.match(/^Guest support request\nName: ([^\n]*)/)?.[1]?.trim() || "";
}

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
      displayName: profile?.displayName ?? (publicSupportName(msgs) || "Unknown"),
      email: profile?.email ?? "",
      threadId: thread.id,
      lastMessage: last ? publicSupportDisplayContent(last.content) : "",
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
    displayName: profile?.displayName ?? (publicSupportName(messages) || "Unknown"),
    email: profile?.email ?? "",
    threadId: thread.id,
    messages: messages.map(m => ({
      id: m.id, threadId: m.threadId, senderRole: m.senderRole,
      content: publicSupportDisplayContent(m.content), createdAt: m.createdAt.toISOString(),
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

router.patch("/admin/support/:userId/messages/:messageId", requireAdmin, async (req, res) => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] ?? "" : req.params.userId;
  const messageId = Number(Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId);
  const content = String(req.body?.content ?? "").trim();

  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    res.status(400).json({ error: "Invalid support message ID." }); return;
  }
  if (!content || content.length > 4000) {
    res.status(400).json({ error: "Message must contain 1–4000 characters." }); return;
  }

  const [thread] = await db.select({ id: supportThreadsTable.id })
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId))
    .limit(1);
  if (!thread) { res.status(404).json({ error: "Support thread not found." }); return; }

  const [existing] = await db.select()
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.id, messageId),
      eq(supportMessagesTable.threadId, thread.id),
    ))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Message not found in this support thread." }); return; }
  // Only admins' own replies may be edited; never alter messages written by users.
  if (existing.senderRole !== "admin") {
    res.status(403).json({ error: "Only admin replies can be edited." }); return;
  }

  const [updated] = await db.update(supportMessagesTable)
    .set({ content })
    .where(and(
      eq(supportMessagesTable.id, messageId),
      eq(supportMessagesTable.threadId, thread.id),
      eq(supportMessagesTable.senderRole, "admin"),
    ))
    .returning();
  await db.update(supportThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(supportThreadsTable.id, thread.id));

  res.json({
    updated: true,
    message: {
      id: updated.id,
      threadId: updated.threadId,
      senderRole: updated.senderRole,
      content: updated.content,
      createdAt: updated.createdAt.toISOString(),
    },
  });
});

router.delete("/admin/support/:userId/messages/:messageId", requireAdmin, async (req, res) => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] ?? "" : req.params.userId;
  const messageId = Number(Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId);

  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    res.status(400).json({ error: "Invalid support message ID." }); return;
  }

  const [thread] = await db.select({ id: supportThreadsTable.id })
    .from(supportThreadsTable)
    .where(eq(supportThreadsTable.clerkUserId, userId))
    .limit(1);
  if (!thread) { res.status(404).json({ error: "Support thread not found." }); return; }

  const [existing] = await db.select({ id: supportMessagesTable.id, senderRole: supportMessagesTable.senderRole })
    .from(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.id, messageId),
      eq(supportMessagesTable.threadId, thread.id),
    ))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Message not found in this support thread." }); return; }
  // Only admins' own replies may be deleted; preserve all customer messages.
  if (existing.senderRole !== "admin") {
    res.status(403).json({ error: "Only admin replies can be deleted." }); return;
  }
  const [deleted] = await db.delete(supportMessagesTable)
    .where(and(
      eq(supportMessagesTable.id, messageId),
      eq(supportMessagesTable.threadId, thread.id),
      eq(supportMessagesTable.senderRole, "admin"),
    ))
    .returning({ id: supportMessagesTable.id });
  if (!deleted) { res.status(404).json({ error: "Message not found in this support thread." }); return; }

  await db.update(supportThreadsTable)
    .set({ updatedAt: new Date() })
    .where(eq(supportThreadsTable.id, thread.id));
  res.json({ deleted: true, messageId: deleted.id });
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

// Authentication-only endpoint: intentionally performs no database work.
router.get("/admin/auth/validate", requireAdmin, (_req, res) => {
  res.json({ authenticated: true });
});

// ─── Admin: stats ────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (_req, res) => {
  const [[{ totalUsers }], [{ pendingDeposits }], [{ pendingWithdrawals }], [{ pendingKyc }], [{ pendingInvestments }], [{ totalTransactions }]] =
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
      db
        .select({ pendingInvestments: count() })
        .from(miningInvestmentsTable)
        .where(eq(miningInvestmentsTable.status, "pending")),
      db.select({ totalTransactions: count() }).from(transactionsTable),
    ]);
  res.json({ totalUsers, pendingDeposits, pendingWithdrawals, pendingKyc, pendingInvestments, totalTransactions });
});

// ─── Admin: users ────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  try {
    // This is a read-only listing: it must not seed or repair member records.
    const profiles = await db
      .select()
      .from(walletProfilesTable)
      .orderBy(desc(walletProfilesTable.createdAt));
    const clerkUserIds = profiles.map((profile) => profile.clerkUserId);
    const accounts = clerkUserIds.length
      ? await db.select().from(tradingAccountsTable).where(inArray(tradingAccountsTable.clerkUserId, clerkUserIds))
      : [];
    const accountByUser = new Map(accounts.map((account) => [account.clerkUserId, account]));
    const result = await Promise.all(
      profiles.map(async (profile) => {
        const account = accountByUser.get(profile.clerkUserId);
        const totalHoldings = asNumber(account?.balance) + asNumber(account?.futuresBalance);

        let email = "";
        let displayName = "";
        let accountStatus: AccountOperationalStatus | "deleted" = "active";
        try {
          const clerkUser = await clerkClient.users.getUser(profile.clerkUserId);
          const primaryEmail = clerkUser.emailAddresses.find(
            (address) => address.id === clerkUser.primaryEmailAddressId,
          );
          email = (primaryEmail ?? clerkUser.emailAddresses[0])?.emailAddress?.trim() ?? "";
          displayName =
            [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim()
            || emailPrefix(email);
          const status = clerkUser.privateMetadata?.[accountStatusKey];
          accountStatus = status === "suspended" || status === "frozen" ? status : "active";
        } catch (error: unknown) {
          if ((error as { status?: number })?.status !== 404) throw error;
          // Clerk no longer has this user; use only the identity already saved locally.
          email = profile.email;
          displayName = profile.displayName?.trim() || emailPrefix(email);
          accountStatus = "deleted";
        }

        return {
          id: String(profile.id),
          clerkUserId: profile.clerkUserId,
          displayName,
          email,
          verificationStatus: profile.verificationStatus,
          referralCode: profile.referralCode,
          totalHoldings,
          createdAt: profile.createdAt.toISOString(),
          accountStatus,
          tradeOutcomeMode: accountByUser.get(profile.clerkUserId)?.tradeOutcomeMode ?? "auto",
        };
      }),
    );
    res.json(result);
  } catch (error: unknown) {
    req.log.error({ err: error }, "Admin user listing failed");
    res.status(503).json({ error: "Unable to load users right now. Please retry." });
  }
});

// Exact amount+value fingerprints of the fixed demo holdings that were once
// seeded for every new signup (BTC/ETH/USDC/BNB). Real deposits/holdings never
// land on these exact numbers, so matching all four fields is safe: it can
// only ever hit leftover seed rows, never a genuine user balance.
const LEGACY_DEMO_HOLDINGS = [
  { symbol: "BTC", amount: "0.1842", value: "11600.12" },
  { symbol: "ETH", amount: "1.842", value: "5756.44" },
  { symbol: "USDC", amount: "1835.2", value: "1835.20" },
  { symbol: "BNB", amount: "1.22", value: "710.21" },
] as const;

router.post("/admin/cleanup-demo-holdings", requireAdmin, async (_req, res) => {
  let deleted = 0;
  for (const seed of LEGACY_DEMO_HOLDINGS) {
    const rows = await db
      .delete(holdingsTable)
      .where(and(
        eq(holdingsTable.symbol, seed.symbol),
        eq(holdingsTable.amount, seed.amount),
        eq(holdingsTable.value, seed.value),
      ))
      .returning({ id: holdingsTable.id });
    deleted += rows.length;
  }
  res.json({ removed: deleted });
});

// Every account created before signups started at a real 0 balance was seeded
// with this exact hardcoded demo starting balance. Only reset accounts that
// still sit at this exact untouched value with zero trades ever placed — that
// combination can only occur if no real deposit, withdrawal, admin
// adjustment, or trade has ever happened on the account, so zeroing it is
// unambiguous. Accounts that drifted from this value (a real trade, a real
// admin adjustment) are left completely alone for manual review.
const LEGACY_DEMO_BALANCE_BASE = "24680.42000000";

router.post("/admin/cleanup-legacy-balance-base", requireAdmin, async (_req, res) => {
  const rows = await db
    .update(tradingAccountsTable)
    .set({ balance: "0", updatedAt: new Date() })
    .where(and(
      eq(tradingAccountsTable.balance, LEGACY_DEMO_BALANCE_BASE),
      eq(tradingAccountsTable.futuresBalance, "0"),
      eq(tradingAccountsTable.totalTrades, 0),
    ))
    .returning({ id: tradingAccountsTable.id });
  res.json({ reset: rows.length });
});

router.post("/admin/users/:userId/balance-adjustment", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const direction = req.body?.direction;
  const rawAmount = String(req.body?.amount ?? "").trim();
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const asset = typeof req.body?.asset === "string" && req.body.asset.trim()
    ? req.body.asset.trim().toUpperCase()
    : "USDT";
  if (direction !== "credit" && direction !== "debit") {
    res.status(400).json({ error: "Balance adjustment direction must be credit or debit." });
    return;
  }
  if (reason.length < 3 || reason.length > 200) {
    res.status(400).json({ error: "A balance adjustment reason between 3 and 200 characters is required." });
    return;
  }

  const [profile] = await db
    .select({ clerkUserId: walletProfilesTable.clerkUserId })
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);
  if (!profile) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  // Non-USDT assets adjust the coin quantity directly in wallet_holdings,
  // leaving every other holding and the USDT trading balance untouched.
  if (asset !== "USDT") {
    const coinAmount = Number(rawAmount);
    if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
      res.status(400).json({ error: "Enter a positive coin quantity to adjust." });
      return;
    }
    const meta = marketDefinitions.find(m => m.symbol === asset)
      ?? miningPlaceDefinitions.find(d => d.symbol === asset);
    let price = TRADING_FALLBACK[asset] ?? 0;
    try {
      const assets = await fetchMarketAssets(req);
      const found = assets.find((a: { symbol: string; price: number }) => a.symbol === asset);
      if (found?.price) price = found.price;
    } catch {
      // fall back to TRADING_FALLBACK / 0 below
    }
    if (asset === "GOLD") price = TRADING_FALLBACK.GOLD ?? price;

    const holdingResult = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:HOLDING:${asset}`}))`);
      const [existing] = await tx.select().from(holdingsTable)
        .where(and(eq(holdingsTable.clerkUserId, userId), eq(holdingsTable.symbol, asset))).limit(1);
      const beforeAmount = existing ? Number(existing.amount) : 0;
      const afterAmount = direction === "credit" ? beforeAmount + coinAmount : beforeAmount - coinAmount;
      if (afterAmount < 0) {
        return { error: `User only holds ${beforeAmount} ${asset}.` };
      }
      const afterValue = afterAmount * price;
      if (existing) {
        await tx.update(holdingsTable).set({
          amount: String(afterAmount),
          value: afterValue.toFixed(2),
        }).where(eq(holdingsTable.id, existing.id));
      } else {
        await tx.insert(holdingsTable).values({
          clerkUserId: userId,
          symbol: asset,
          name: meta?.name ?? asset,
          amount: String(afterAmount),
          value: afterValue.toFixed(2),
          allocation: "0",
          change24h: "0",
          color: meta?.color ?? "#888888",
        });
      }
      const [transaction] = await tx.insert(transactionsTable).values({
        clerkUserId: userId,
        type: direction === "credit" ? "deposit" : "withdrawal",
        asset,
        amount: String(coinAmount),
        destination: `Admin balance adjustment (${direction}; ${beforeAmount} -> ${afterAmount} ${asset}): ${reason}`,
        status: "completed",
      }).returning();
      await tx.insert(activitiesTable).values({
        clerkUserId: userId,
        type: direction === "credit" ? "deposit" : "withdrawal",
        asset,
        amount: String(coinAmount),
        value: afterValue.toFixed(2),
        status: "completed",
        transactionId: transaction.id,
      });
      return { amount: afterAmount, value: afterValue };
    });
    if ("error" in holdingResult) {
      res.status(409).json({ error: holdingResult.error });
      return;
    }
    res.json({ userId, asset, direction, amount: coinAmount, holdingAmount: holdingResult.amount, holdingValue: holdingResult.value });
    return;
  }

  const amountString = normalizeStablecoinAmount(rawAmount);
  if (!amountString) {
    res.status(400).json({ error: "Balance adjustment must be between 0 and 1,000,000,000 USDT." });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
    await tx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${userId}
      for update
    `);
    const [account] = await tx
      .select()
      .from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, userId))
      .limit(1);
    if (!account) {
      return { error: "Persisted trading account is missing. Reconcile the member's balance before adjusting it." };
    }
    const balanceUpdate = direction === "credit"
      ? sql`${tradingAccountsTable.balance} + ${amountString}`
      : sql`${tradingAccountsTable.balance} - ${amountString}`;
    const debitAvailability = sql`${tradingAccountsTable.balance} - coalesce((
      select sum(${tradesTable.amount})
      from ${tradesTable}
      where ${tradesTable.clerkUserId} = ${userId}
        and ${tradesTable.status} = 'active'
    ), 0) >= ${amountString}`;
    const [updatedAccount] = await tx
      .update(tradingAccountsTable)
      .set({ balance: balanceUpdate, updatedAt: new Date() })
      .where(direction === "debit"
        ? and(eq(tradingAccountsTable.id, account.id), debitAvailability)
        : eq(tradingAccountsTable.id, account.id))
      .returning();
    if (!updatedAccount) {
      return { error: "Insufficient available USDT." };
    }

    const beforeBalance = account.balance;
    const afterBalance = updatedAccount.balance;
    const [transaction] = await tx.insert(transactionsTable).values({
      clerkUserId: userId,
      type: direction === "credit" ? "deposit" : "withdrawal",
      asset: "USDT",
      amount: amountString,
      destination: `Admin balance adjustment (${direction}; ${beforeBalance} -> ${afterBalance} USDT): ${reason}`,
      status: "completed",
    }).returning();
    await tx.insert(activitiesTable).values({
      clerkUserId: userId,
      type: direction === "credit" ? "deposit" : "withdrawal",
      asset: "USDT",
      amount: amountString,
      value: amountString,
      status: "completed",
      transactionId: transaction.id,
    });
    return { account: updatedAccount };
  });

  if ("error" in result) {
    res.status(409).json({ error: result.error });
    return;
  }
  res.json({
    userId,
    asset: "USDT",
    direction,
    amount: amountString,
    balance: asNumber(result.account.balance),
  });
});

router.patch("/admin/users/:userId/status", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const status = req.body?.status;
  if (status !== "active" && status !== "suspended" && status !== "frozen") {
    res.status(400).json({ error: "Account status must be active, suspended, or frozen." });
    return;
  }
  if (userId === "demo_user") {
    res.status(400).json({ error: "The demo account cannot be changed." });
    return;
  }
  try {
    await setAccountOperationalStatus(userId, status);
    res.json({ userId, accountStatus: status });
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) {
      res.status(404).json({ error: "User account not found." });
      return;
    }
    res.status(500).json({ error: "Unable to update account status." });
  }
});

router.delete("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  if (userId === "demo_user") {
    res.status(400).json({ error: "The demo account cannot be deleted." });
    return;
  }
  try {
    await clerkClient.users.deleteUser(userId);
    accountStatusCache.delete(userId);
    res.json({ deleted: true, userId });
  } catch (error: unknown) {
    if ((error as { status?: number })?.status === 404) {
      res.status(404).json({ error: "User account not found." });
      return;
    }
    res.status(500).json({ error: "Unable to delete user account." });
  }
});

router.get("/admin/users/:userId", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const [profile] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);
  if (!profile) { res.status(404).json({ error: "User not found" }); return; }

  const [holdings, transactions, kycRows, accountRows] = await Promise.all([
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
    db.select().from(tradingAccountsTable).where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1),
  ]);

  // Real, live trading balance — never a cached or seeded figure — matching
  // exactly what the user's own Dashboard/Wallet reads.
  const totalHoldings = asNumber(accountRows[0]?.balance) + asNumber(accountRows[0]?.futuresBalance);
  const kyc = kycRows[0] ? await enrichKyc(kycRows[0]) : null;
  const clerkInfo = await fetchClerkUserInfo(userId);
  const displayName = clerkInfo.name || profile.displayName;
  const email = clerkInfo.email || profile.email;

  res.json({
    id: String(profile.id),
    clerkUserId: profile.clerkUserId,
    displayName,
    email,
    verificationStatus: profile.verificationStatus,
    totalHoldings,
    createdAt: profile.createdAt.toISOString(),
    tradeOutcomeMode: accountRows[0]?.tradeOutcomeMode ?? "auto",
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
      displayName,
      email,
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
  const result = await db.transaction(async (databaseTx) => {
    await databaseTx.execute(sql`
      select id from ${transactionsTable}
      where ${transactionsTable.id} = ${txId}
      for update
    `);
    const [pendingTransaction] = await databaseTx
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId))
      .limit(1);
    if (!pendingTransaction) return { kind: "not_found" as const };
    if (pendingTransaction.status !== "pending") return { kind: "processed" as const };

    await databaseTx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${pendingTransaction.clerkUserId}:TRADING_BALANCE`}))`);
    await databaseTx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${pendingTransaction.clerkUserId}
      for update
    `);
    const [persistedAccount] = await databaseTx.select({ id: tradingAccountsTable.id })
      .from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, pendingTransaction.clerkUserId))
      .limit(1);
    if (!persistedAccount) return { kind: "missing_account" as const };

    if (pendingTransaction.type === "withdrawal") {
      const [debitedAccount] = await databaseTx.update(tradingAccountsTable).set({
        balance: sql`${tradingAccountsTable.balance} - ${pendingTransaction.amount}`,
        updatedAt: new Date(),
      }).where(and(
        eq(tradingAccountsTable.clerkUserId, pendingTransaction.clerkUserId),
        sql`${tradingAccountsTable.balance} >= ${pendingTransaction.amount}`,
      )).returning();
      if (!debitedAccount) return { kind: "insufficient" as const };
    }

    if (pendingTransaction.type === "deposit") {
      await databaseTx.update(tradingAccountsTable).set({
        balance: sql`${tradingAccountsTable.balance} + ${pendingTransaction.amount}`,
        updatedAt: new Date(),
      }).where(eq(tradingAccountsTable.clerkUserId, pendingTransaction.clerkUserId));
    }

    await databaseTx.execute(sql`
      select id from ${holdingsTable}
      where ${holdingsTable.clerkUserId} = ${pendingTransaction.clerkUserId}
        and ${holdingsTable.symbol} = ${pendingTransaction.asset}
      for update
    `);
    const [existing] = await databaseTx.select().from(holdingsTable).where(and(
      eq(holdingsTable.clerkUserId, pendingTransaction.clerkUserId),
      eq(holdingsTable.symbol, pendingTransaction.asset),
    )).limit(1);
    const amount = asNumber(pendingTransaction.amount);

    if (pendingTransaction.type === "deposit") {
      if (existing) {
        await databaseTx.update(holdingsTable).set({
          amount: sql`${holdingsTable.amount} + ${pendingTransaction.amount}`,
          value: sql`${holdingsTable.value} + ${pendingTransaction.amount}`,
        }).where(eq(holdingsTable.id, existing.id));
      } else {
        const assetDef = marketDefinitions.find((market) => market.symbol === pendingTransaction.asset);
        await databaseTx.insert(holdingsTable).values({
          clerkUserId: pendingTransaction.clerkUserId,
          symbol: pendingTransaction.asset,
          name: assetDef?.name ?? pendingTransaction.asset,
          amount: String(amount),
          value: String(amount),
          allocation: "0",
          change24h: "0",
          color: assetDef?.color ?? "#888888",
        });
      }
    } else if (pendingTransaction.type === "withdrawal" && existing) {
      await databaseTx.update(holdingsTable).set({
        amount: sql`greatest(0, ${holdingsTable.amount} - ${pendingTransaction.amount})`,
        value: sql`greatest(0, ${holdingsTable.value} - ${pendingTransaction.amount})`,
      }).where(eq(holdingsTable.id, existing.id));
    }

    const [completed] = await databaseTx.update(transactionsTable)
      .set({ status: "completed" })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
      .returning();
    if (!completed) throw new Error("Transaction approval claim was lost.");
    await databaseTx.update(activitiesTable)
      .set({ status: "completed" })
      .where(eq(activitiesTable.transactionId, txId));
    return { kind: "approved" as const, transaction: completed };
  });

  if (result.kind === "not_found") {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  if (result.kind === "processed") {
    res.status(409).json({ error: "Transaction has already been processed." });
    return;
  }
  if (result.kind === "insufficient") {
    res.status(409).json({ error: "Insufficient canonical balance to approve this withdrawal." });
    return;
  }
  if (result.kind === "missing_account") {
    res.status(409).json({ error: "The member's persisted trading account is missing. Reconcile it before approving this transaction." });
    return;
  }
  res.json(await enrichTransaction(result.transaction));
});

router.patch("/admin/transactions/:id/reject", requireAdmin, async (req, res) => {
  const txId = Number(req.params.id);
  const [tx] = await db
    .update(transactionsTable)
    .set({ status: "failed" })
    .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.status, "pending")))
    .returning();
  if (!tx) {
    res.status(409).json({ error: "Transaction was not found or has already been processed." });
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
  const kyc = await db.transaction(async (transaction) => {
    const [approved] = await transaction
      .update(kycSubmissionsTable)
      .set({ status: "verified" })
      .where(and(eq(kycSubmissionsTable.id, kycId), eq(kycSubmissionsTable.status, "pending")))
      .returning();
    if (!approved) return null;
    await transaction
      .update(walletProfilesTable)
      .set({ verificationStatus: "verified" })
      .where(eq(walletProfilesTable.clerkUserId, approved.clerkUserId));
    return approved;
  });
  if (!kyc) {
    res.status(409).json({ error: "KYC submission was not found or has already been reviewed." });
    return;
  }
  res.json(await enrichKyc(kyc));
});

router.patch("/admin/kyc/:id/reject", requireAdmin, async (req, res) => {
  const kycId = Number(req.params.id);
  const kyc = await db.transaction(async (transaction) => {
    const [rejected] = await transaction
      .update(kycSubmissionsTable)
      .set({ status: "rejected" })
      .where(and(eq(kycSubmissionsTable.id, kycId), eq(kycSubmissionsTable.status, "pending")))
      .returning();
    if (!rejected) return null;
    await transaction
      .update(walletProfilesTable)
      .set({ verificationStatus: "unverified" })
      .where(eq(walletProfilesTable.clerkUserId, rejected.clerkUserId));
    return rejected;
  });
  if (!kyc) {
    res.status(409).json({ error: "KYC submission was not found or has already been reviewed." });
    return;
  }
  res.json(await enrichKyc(kyc));
});

// ─── Trading / Futures ────────────────────────────────────────────────────────

const TRADING_FALLBACK: Record<string, number> = {
  BTC: 67000, ETH: 3500, BNB: 580, SOL: 145, XRP: 0.52, GOLD: 2348.4,
};

// ─── Per-asset minimum trade amount (USDT) ─────────────────────────────────────
// A trade cannot be placed, and the account balance must already be at or
// above this threshold, before a trade in that asset is allowed at all.
const ASSET_MIN_TRADE: Record<string, number> = {
  GOLD: 30000,
  BTC: 5000,
  ETH: 1000,
  BNB: 1000,
  SOL: 1000,
};
const DEFAULT_MIN_TRADE = 10000; // any other market coin not listed above

function minTradeAmountFor(asset: string): number {
  return ASSET_MIN_TRADE[asset] ?? DEFAULT_MIN_TRADE;
}

// ─── Fixed payout rates per asset ──────────────────────────────────────────────
const ASSET_PAYOUT_RATE: Record<string, number> = {
  BTC: 0.30,
  ETH: 0.20, BNB: 0.20, SOL: 0.20, XRP: 0.20,
};
const DEFAULT_PAYOUT_RATE = 0.10; // any other new coin

// ─── GOLD investment tiers (amount range → fixed payout %) ─────────────────────
const GOLD_TIERS = [
  { min: 30_000, max: 99_000, payout: 0.50 },
  { min: 100_000, max: 200_000, payout: 0.60 },
  { min: 500_000, max: 1_000_000, payout: 0.70 },
  { min: 2_000_000, max: 5_000_000, payout: 0.80 },
  { min: 6_000_000, max: 10_000_000, payout: 0.95 },
] as const;

function resolveGoldPayoutRate(amount: number): number {
  // Exact range match first.
  const exact = GOLD_TIERS.find(t => amount >= t.min && amount <= t.max);
  if (exact) return exact.payout;
  // Amount falls between tiers (or above the top tier) — use the highest
  // tier whose minimum the amount clears, so a valid GOLD trade always
  // resolves to a defined payout rate.
  const applicable = [...GOLD_TIERS].reverse().find(t => amount >= t.min);
  return applicable?.payout ?? GOLD_TIERS[0].payout;
}

function payoutRateFor(asset: string, amount: number): number {
  if (asset === "GOLD") return resolveGoldPayoutRate(amount);
  return ASSET_PAYOUT_RATE[asset] ?? DEFAULT_PAYOUT_RATE;
}

async function requireTradingAccount(userId: string) {
  const [acct] = await db.select().from(tradingAccountsTable)
    .where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1);
  if (!acct) {
    throw new Error(
      "This member has no persisted trading account. Reconcile the account before displaying or changing balances.",
    );
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

async function settleActiveTrade(
  tradeId: number,
  forcedOutcome?: "win" | "loss",
  liveQuote?: FuturesQuote | null,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      select id from ${tradesTable}
      where ${tradesTable.id} = ${tradeId}
      for update
    `);
    const [trade] = await tx.select().from(tradesTable).where(eq(tradesTable.id, tradeId)).limit(1);
    if (!trade || trade.status !== "active") {
      return { trade, settled: false, error: null };
    }

    const now = new Date();
    const entry = Number(trade.entryPrice);
    let outcome: "win" | "loss";
    let exitPrice: number;
    if (forcedOutcome) {
      outcome = forcedOutcome;
      exitPrice = outcome === "win"
        ? (trade.direction === "long" ? entry * 1.01 : entry * 0.99)
        : (trade.direction === "long" ? entry * 0.99 : entry * 1.01);
    } else if (trade.adminOverride) {
      outcome = trade.adminOverride as "win" | "loss";
      exitPrice = outcome === "win"
        ? (trade.direction === "long" ? entry * 1.01 : entry * 0.99)
        : (trade.direction === "long" ? entry * 0.99 : entry * 1.01);
    } else {
      const [tradeAccount] = await tx.select({ tradeOutcomeMode: tradingAccountsTable.tradeOutcomeMode })
        .from(tradingAccountsTable).where(eq(tradingAccountsTable.clerkUserId, trade.clerkUserId)).limit(1);
      if (tradeAccount?.tradeOutcomeMode === "always_win" || tradeAccount?.tradeOutcomeMode === "always_lose") {
        // Preserve the existing explicit admin-controlled outcome mode.
        outcome = tradeAccount.tradeOutcomeMode === "always_win" ? "win" : "loss";
        exitPrice = outcome === "win"
          ? (trade.direction === "long" ? entry * 1.01 : entry * 0.99)
          : (trade.direction === "long" ? entry * 0.99 : entry * 1.01);
      } else {
        // Ordinary Spot trades settle only against a real provider trade made
        // at or after expiry. If the feed is stale, leave the trade and balance
        // untouched until a qualifying timestamped trade becomes available.
        if (!isFreshExecutionQuote(liveQuote)
          || liveQuote!.updatedAt < trade.expiresAt.getTime()) {
          return { trade, settled: false, error: "A fresh post-expiry market trade is unavailable. Trade remains pending." };
        }
        exitPrice = liveQuote!.price;
        if (!Number.isFinite(entry) || entry <= 0) {
          return { trade, settled: false, error: "The stored entry price is invalid. Trade remains pending." };
        }
        const move = exitPrice - entry;
        outcome = move === 0
          ? "loss"
          : (trade.direction === "long" ? move > 0 : move < 0) ? "win" : "loss";
      }
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${trade.clerkUserId}:TRADING_BALANCE`}))`);
    await tx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${trade.clerkUserId}
      for update
    `);
    const [account] = await tx.select().from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, trade.clerkUserId)).limit(1);
    if (!account) {
      throw new Error("Cannot settle a trade without its persisted trading account.");
    }
    const balanceUpdate = outcome === "win"
      ? sql`${tradingAccountsTable.balance} + (${trade.amount}::numeric * ${trade.payoutRate}::numeric)`
      : sql`${tradingAccountsTable.balance} - ${trade.amount}`;
    const [updatedAccount] = await tx.update(tradingAccountsTable).set({
      balance: balanceUpdate,
      wins: outcome === "win" ? sql`${tradingAccountsTable.wins} + 1` : tradingAccountsTable.wins,
      losses: outcome === "loss" ? sql`${tradingAccountsTable.losses} + 1` : tradingAccountsTable.losses,
      updatedAt: now,
    }).where(outcome === "loss"
      ? and(eq(tradingAccountsTable.id, account.id), sql`${tradingAccountsTable.balance} >= ${trade.amount}`)
      : eq(tradingAccountsTable.id, account.id))
      .returning();
    if (!updatedAccount) {
      return { trade, settled: false, error: "Insufficient USDT balance to settle this loss." };
    }

    const payoutUpdate = outcome === "win"
      ? sql`${tradesTable.amount} * ${tradesTable.payoutRate}`
      : sql`-${tradesTable.amount}`;
    const [settledTrade] = await tx.update(tradesTable).set({
      status: "completed",
      result: outcome,
      adminOverride: forcedOutcome ?? trade.adminOverride,
      exitPrice: String(exitPrice),
      payout: payoutUpdate,
      settledAt: now,
    }).where(and(eq(tradesTable.id, trade.id), eq(tradesTable.status, "active"))).returning();
    if (!settledTrade) {
      throw new Error("Trade settlement claim was lost.");
    }

    return { trade: settledTrade, settled: true, error: null, balance: updatedAccount.balance };
  });
}

async function autoSettleExpiredTrades(userId: string, req: Request) {
  const active = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.clerkUserId, userId), eq(tradesTable.status, "active")));
  const [tradeAccount] = await db.select({ tradeOutcomeMode: tradingAccountsTable.tradeOutcomeMode })
    .from(tradingAccountsTable).where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1);
  const adminControlledMode = tradeAccount?.tradeOutcomeMode === "always_win" ||
    tradeAccount?.tradeOutcomeMode === "always_lose";
  const now = new Date();
  for (const trade of active) {
    if (trade.expiresAt > now) continue;
    if (trade.adminOverride || adminControlledMode) {
      await settleActiveTrade(trade.id);
      continue;
    }
    const quote = await getFuturesQuote(req, trade.asset);
    await settleActiveTrade(trade.id, undefined, quote);
  }
}

router.get("/trading/account", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  await autoSettleExpiredTrades(userId, req);
  const acct = await requireTradingAccount(userId);
  res.json(tradingAccountResponse(acct));
});

function tradingAccountResponse(acct: typeof tradingAccountsTable.$inferSelect) {
  return {
    balance: asNumber(acct.balance),
    futuresBalance: asNumber(acct.futuresBalance),
    totalTrades: acct.totalTrades,
    wins: acct.wins,
    losses: acct.losses,
  };
}

router.post("/trading/transfer", async (req, res): Promise<void> => {
  const parsed = TransferTradingBalanceBody.safeParse(req.body);
  const amount = parsed.success ? normalizeStablecoinAmount(parsed.data.amount) : null;
  if (!parsed.success || !amount) {
    res.status(400).json({ error: "Enter a positive USDT amount with up to 8 decimal places and choose a direction." });
    return;
  }
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  const toFutures = parsed.data.direction === "spot_to_futures";
  const account = await db.transaction(async (tx) => {
    // The same lock order as trade placement and settlement prevents a transfer
    // from using funds reserved for an active Spot position.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
    await tx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${userId} for update
    `);
    const [updated] = await tx.update(tradingAccountsTable).set({
      balance: toFutures
        ? sql`${tradingAccountsTable.balance} - ${amount}::numeric`
        : sql`${tradingAccountsTable.balance} + ${amount}::numeric`,
      futuresBalance: toFutures
        ? sql`${tradingAccountsTable.futuresBalance} + ${amount}::numeric`
        : sql`${tradingAccountsTable.futuresBalance} - ${amount}::numeric`,
      updatedAt: new Date(),
    }).where(and(
      eq(tradingAccountsTable.clerkUserId, userId),
      toFutures
        ? sql`${tradingAccountsTable.balance} - coalesce((
            select sum(${tradesTable.amount}) from ${tradesTable}
            where ${tradesTable.clerkUserId} = ${userId}
              and ${tradesTable.status} = 'active'
          ), 0) >= ${amount}::numeric`
        : sql`${tradingAccountsTable.futuresBalance} - coalesce((
            select sum(${futuresPositionsTable.margin}) from ${futuresPositionsTable}
            where ${futuresPositionsTable.clerkUserId} = ${userId}
              and ${futuresPositionsTable.status} = 'active'
          ), 0) >= ${amount}::numeric`,
    )).returning();
    return updated;
  });
  if (!account) {
    res.status(400).json({ error: `Insufficient available ${toFutures ? "Spot" : "Futures"} USDT balance.` });
    return;
  }
  res.json(TransferTradingBalanceResponse.parse(tradingAccountResponse(account)));
});

router.get("/trading/trades", async (req, res) => {
  const userId = getUserId(req);
  await autoSettleExpiredTrades(userId, req);
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
  const assetSymbol = asset.toUpperCase();
  if (assetSymbol !== "GOLD" && !marketDefinitions.some((definition) => definition.symbol === assetSymbol)) {
    res.status(400).json({ error: "Unsupported trading asset." }); return;
  }
  if (!Number.isSafeInteger(timeframeSecs) || !VALID_SPOT_TIMEFRAMES.has(timeframeSecs)) {
    res.status(400).json({ error: "Choose a supported Spot trade expiry timeframe." }); return;
  }
  const amountString = normalizeStablecoinAmount(String(amount));
  if (!amountString) { res.status(400).json({ error: "Amount must be a positive value with up to 8 decimal places." }); return; }
  const minTrade = minTradeAmountFor(assetSymbol);
  const amountNumber = Number(amountString);
  if (amountNumber < minTrade) {
    res.status(400).json({ error: `Minimum trade amount for ${assetSymbol} is ${minTrade.toLocaleString()} USDT.` });
    return;
  }
  await ensureSeededUser(userId);
  const tradingAccount = await requireTradingAccount(userId);
  if (Number(tradingAccount.balance) < minTrade) {
    res.status(400).json({ error: `Your trading balance must be at least ${minTrade.toLocaleString()} USDT to trade ${assetSymbol}.` });
    return;
  }
  const resolvedPayoutRate = payoutRateFor(assetSymbol, amountNumber);
  const entryQuote = await getFuturesQuote(req, assetSymbol);
  if (!entryQuote || !isFreshExecutionQuote(entryQuote)) {
    res.status(503).json({ error: "A fresh exchange trade is unavailable. No Spot order was opened." });
    return;
  }
  const entryPrice = entryQuote.price;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + timeframeSecs * 1000);
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
    await tx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${userId}
      for update
    `);
    const [availableAccount] = await tx.select().from(tradingAccountsTable).where(and(
      eq(tradingAccountsTable.clerkUserId, userId),
      sql`${tradingAccountsTable.balance} - coalesce((
        select sum(${tradesTable.amount})
        from ${tradesTable}
        where ${tradesTable.clerkUserId} = ${userId}
          and ${tradesTable.status} = 'active'
      ), 0) >= ${amountString}`,
    )).limit(1);
    if (!availableAccount) return null;
    if (!isFreshExecutionQuote(entryQuote)) return "stale" as const;
    const [trade] = await tx.insert(tradesTable).values({
      clerkUserId: userId,
      asset: assetSymbol,
      direction,
      amount: amountString,
      timeframeSecs,
      entryPrice: String(entryPrice),
      expiresAt,
      payoutRate: String(resolvedPayoutRate),
    }).returning();
    await tx.update(tradingAccountsTable).set({
      totalTrades: sql`${tradingAccountsTable.totalTrades} + 1`,
      updatedAt: now,
    }).where(eq(tradingAccountsTable.clerkUserId, userId));
    return { trade, balance: availableAccount.balance };
  });
  if (result === "stale") {
    res.status(503).json({ error: "The market trade became stale before order placement. No Spot order was opened." });
    return;
  }
  if (!result) {
    res.status(400).json({ error: "Insufficient available USDT balance after active trade reservations." });
    return;
  }
  res.json({
    tradeId: result.trade.id,
    balance: asNumber(result.balance),
    entryPrice,
    expiresAt: result.trade.expiresAt.toISOString(),
  });
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

router.patch("/admin/users/:userId/trading-mode", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const mode = req.body?.mode;
  if (!["auto", "always_win", "always_lose"].includes(mode)) {
    res.status(400).json({ error: "mode must be 'auto', 'always_win', or 'always_lose'." });
    return;
  }
  const [profile] = await db.select({ clerkUserId: walletProfilesTable.clerkUserId })
    .from(walletProfilesTable).where(eq(walletProfilesTable.clerkUserId, userId)).limit(1);
  if (!profile) { res.status(404).json({ error: "User not found." }); return; }
  const [account] = await db.select({ id: tradingAccountsTable.id })
    .from(tradingAccountsTable)
    .where(eq(tradingAccountsTable.clerkUserId, userId))
    .limit(1);
  if (!account) {
    res.status(409).json({ error: "The member's persisted trading account is missing. Reconcile it before changing trade controls." });
    return;
  }
  await db.update(tradingAccountsTable).set({ tradeOutcomeMode: mode, updatedAt: new Date() })
    .where(eq(tradingAccountsTable.clerkUserId, userId));
  res.json({ userId, tradeOutcomeMode: mode });
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
    const settlement = await settleActiveTrade(tradeId, outcome as "win" | "loss");
    if (!settlement.settled) {
      res.status(409).json({ error: settlement.error ?? "Trade is no longer active." });
      return;
    }
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