import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { eq, desc, count, and, inArray, sql } from "drizzle-orm";
import { generateSecret as totpGenerateSecret, generateURI as totpGenerateURI, verifySync as totpVerifySync } from "otplib";
import {
  db,
  activitiesTable,
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
  category: "gold" | "energy" | "stock" | "oil";
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

const seedPrices: Record<string, number> = {
  bitcoin: 62987.32,
  ethereum: 3124.77,
  tether: 1,
  binancecoin: 582.14,
  "usd-coin": 1,
  dai: 0.9998,
  "first-digital-usd": 1,
  ripple: 0.52,
  solana: 145.2,
  tron: 0.27,
  hyperliquid: 24.4,
  zcash: 42.1,
  dogecoin: 0.13,
  "leo-token": 8.9,
  monero: 285,
  chainlink: 14.7,
  cardano: 0.44,
  stellar: 0.23,
  "bitcoin-cash": 510,
  "canton-network": 0.12,
  "usd1-wlfi": 1,
  "ethena-usde": 1,
  litecoin: 72,
  "the-open-network": 3.1,
  "hedera-hashgraph": 0.09,
  "avalanche-2": 22,
  sui: 1.6,
  "shiba-inu": 0.000012,
  uniswap: 7.4,
  "paypal-usd": 1,
  "crypto-com-chain": 0.11,
  "tether-gold": 2900,
  bittensor: 320,
  near: 2.8,
  memecore: 0.02,
};

const seedChanges: Record<string, number> = {
  bitcoin: 2.84,
  ethereum: 1.61,
  tether: 0.02,
  binancecoin: -0.44,
  "usd-coin": 0.01,
  dai: -0.03,
  "first-digital-usd": 0.04,
  ripple: 0.8,
  solana: 1.2,
  tron: 0.3,
  hyperliquid: -0.6,
  zcash: 0.5,
  dogecoin: 1.1,
  "leo-token": 0.2,
  monero: -0.4,
  chainlink: 1.4,
  cardano: 0.7,
  stellar: -0.2,
  "bitcoin-cash": 0.5,
  "canton-network": 0.9,
  "usd1-wlfi": 0.01,
  "ethena-usde": -0.02,
  litecoin: 0.3,
  "the-open-network": 1.6,
  "hedera-hashgraph": 0.4,
  "avalanche-2": -0.7,
  sui: 1.3,
  "shiba-inu": 0.9,
  uniswap: 0.6,
  "paypal-usd": 0.01,
  "crypto-com-chain": 0.8,
  "tether-gold": 0.2,
  bittensor: -1.1,
  near: 0.5,
  memecore: 2.4,
};

const miningPlaceDefinitions: MiningPlaceDefinition[] = [
  { symbol: "GOLD", name: "Gold", category: "gold", yahooSymbol: "GC=F", unit: "oz", fallbackPrice: 2348.4, fallbackChange: 0.42, color: "#d6ad3b" },
  { symbol: "XLE", name: "Energy Select Sector", category: "energy", yahooSymbol: "XLE", unit: "share", fallbackPrice: 91.72, fallbackChange: 0.68, color: "#4dbb8a" },
  { symbol: "OIL", name: "Crude Oil", category: "oil", yahooSymbol: "CL=F", unit: "barrel", fallbackPrice: 78.34, fallbackChange: -0.31, color: "#9d7b52" },
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

type AccountOperationalStatus = "active" | "suspended" | "frozen";
const accountStatusKey = "accountStatus";
const accountStatusCache = new Map<string, { status: AccountOperationalStatus; expiresAt: number }>();
const ACCOUNT_STATUS_CACHE_TTL = 15_000;

async function getAccountOperationalStatus(userId: string): Promise<AccountOperationalStatus> {
  if (userId === "demo_user") return "active";
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

const DEFAULT_PORTFOLIO_BALANCE = "24680.42000000";
const portfolioSeededUsers = new Set<string>();
const defaultPortfolioHoldings = [
  { symbol: "BTC", name: "Bitcoin", amount: "0.1842", value: "11600.12", allocation: "47.00", change24h: "2.84", color: "#F7931A" },
  { symbol: "ETH", name: "Ethereum", amount: "1.842", value: "5756.44", allocation: "23.32", change24h: "1.61", color: "#627EEA" },
  { symbol: "USDC", name: "USD Coin", amount: "1835.2", value: "1835.20", allocation: "7.44", change24h: "0.01", color: "#2775CA" },
  { symbol: "BNB", name: "BNB", amount: "1.22", value: "710.21", allocation: "2.88", change24h: "-0.44", color: "#F3BA2F" },
  { symbol: "USDT", name: "Tether", amount: "320.5", value: "320.50", allocation: "1.30", change24h: "0.02", color: "#26A17B" },
] as const;

const defaultPortfolioActivities = [
  { type: "deposit", asset: "USD", amount: "5000", value: "5000", status: "completed", ageMs: 1000 * 60 * 52 },
  { type: "buy", asset: "BTC", amount: "0.042", value: "2645.48", status: "completed", ageMs: 1000 * 60 * 60 * 7 },
  { type: "deposit", asset: "USDC", amount: "850", value: "850", status: "failed", ageMs: 1000 * 60 * 60 * 28 },
  { type: "withdrawal", asset: "ETH", amount: "0.35", value: "1093.67", status: "pending", ageMs: 1000 * 60 * 60 * 24 * 3 },
] as const;

const portfolioHistoryMultipliers = [0.938, 0.944, 0.941, 0.956, 0.963, 0.958, 0.972, 0.968, 0.981, 0.977, 0.989, 0.986, 1];

function defaultProfileResponse(userId: string) {
  return GetProfileResponse.parse({
    id: userId,
    name: "Alex Morgan",
    email: "alex@example.com",
    initials: "AM",
    verificationStatus: "verified",
    referralCode: "NORTHSTAR-ALEX",
    twoFactorEnabled: false,
    smsPhoneNumber: null,
    smsPhoneVerified: false,
  });
}

function defaultActivityResponse() {
  const now = Date.now();
  return GetActivityResponse.parse(defaultPortfolioActivities.map((activity, index) => ({
    id: `sample-${index + 1}`,
    type: activity.type,
    asset: activity.asset,
    amount: asNumber(activity.amount),
    value: asNumber(activity.value),
    status: activity.status,
    createdAt: new Date(now - activity.ageMs).toISOString(),
  })));
}

function serializePortfolio(
  balance: string | number,
  holdings: ReadonlyArray<{
    symbol: string;
    name: string;
    amount: string | number;
    value: string | number;
    allocation: string | number;
    change24h: string | number;
    color: string;
  }>,
) {
  const totalValue = asNumber(balance);
  const holdingsValue = holdings.reduce((total, holding) => total + asNumber(holding.value), 0);
  const dayChange = holdings.reduce(
    (total, holding) => total + (asNumber(holding.value) * asNumber(holding.change24h)) / 100,
    0,
  );

  return GetPortfolioResponse.parse({
    totalValue,
    dayChange,
    dayChangePercent: totalValue ? (dayChange / totalValue) * 100 : 0,
    cashBalance: Math.max(0, totalValue - holdingsValue),
    history: portfolioHistoryMultipliers.map((multiplier, index) => ({
      time: `${String(index * 2).padStart(2, "0")}:00`,
      value: Number((totalValue * multiplier).toFixed(2)),
    })),
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      name: holding.name,
      amount: asNumber(holding.amount),
      value: asNumber(holding.value),
      allocation: asNumber(holding.allocation),
      change24h: asNumber(holding.change24h),
      color: holding.color,
    })),
  });
}

async function ensureDefaultPortfolio(userId: string) {
  if (portfolioSeededUsers.has(userId)) return;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [existingHoldings, existingActivities, existingAccount, existingTransactions, existingTrades] = await Promise.all([
      tx.select().from(holdingsTable).where(eq(holdingsTable.clerkUserId, userId)),
      tx.select().from(activitiesTable).where(eq(activitiesTable.clerkUserId, userId)),
      tx.select().from(tradingAccountsTable).where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1),
      tx.select({ count: count() }).from(transactionsTable).where(eq(transactionsTable.clerkUserId, userId)),
      tx.select({ count: count() }).from(tradesTable).where(eq(tradesTable.clerkUserId, userId)),
    ]);

    const existingSymbols = new Set(existingHoldings.map((holding) => holding.symbol));
    const missingHoldings = defaultPortfolioHoldings.filter((holding) => !existingSymbols.has(holding.symbol));
    if (missingHoldings.length > 0) {
      await tx.insert(holdingsTable).values(
        missingHoldings.map((holding) => ({ clerkUserId: userId, ...holding })),
      );
    }

    const missingActivities = defaultPortfolioActivities.filter((sample) => !existingActivities.some((activity) =>
      activity.type === sample.type
      && activity.asset === sample.asset
      && String(activity.amount) === Number(sample.amount).toFixed(12)
      && activity.status === sample.status
    ));
    if (missingActivities.length > 0) {
      await tx.insert(activitiesTable).values(
        missingActivities.map(({ ageMs, ...activity }) => ({
          clerkUserId: userId,
          ...activity,
          createdAt: new Date(Date.now() - ageMs),
        })),
      );
    }

    if (!existingAccount[0]) {
      await tx.insert(tradingAccountsTable).values({
        clerkUserId: userId,
        balance: DEFAULT_PORTFOLIO_BALANCE,
      }).onConflictDoNothing();
    } else if (
      asNumber(existingAccount[0].balance) === 0
      && (
        missingHoldings.length > 0
        || (
          Number(existingTransactions[0]?.count ?? 0) === 0
          && Number(existingTrades[0]?.count ?? 0) === 0
        )
      )
    ) {
      await tx.update(tradingAccountsTable)
        .set({ balance: DEFAULT_PORTFOLIO_BALANCE, updatedAt: new Date() })
        .where(eq(tradingAccountsTable.clerkUserId, userId));
    }
  });
  portfolioSeededUsers.add(userId);
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

const CLERK_USER_SYNC_TTL_MS = 60_000;
let clerkUserSyncCompletedAt = 0;
let clerkUserSyncInFlight: Promise<number> | null = null;

function clerkUserIdentity(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  )?.emailAddress;
  const email = primaryEmail ?? user.emailAddresses[0]?.emailAddress ?? "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    email: email || `${user.id}@clerk-user.invalid`,
    displayName: name || emailPrefix(email) || "North State Blockchain Member",
  };
}

async function syncClerkUsersToWalletProfiles(force = false): Promise<number> {
  if (!force && Date.now() - clerkUserSyncCompletedAt < CLERK_USER_SYNC_TTL_MS) {
    return 0;
  }
  if (clerkUserSyncInFlight) return clerkUserSyncInFlight;

  clerkUserSyncInFlight = (async () => {
    const users: Awaited<ReturnType<typeof clerkClient.users.getUserList>>["data"] = [];
    const limit = 100;
    let offset = 0;
    let totalCount = 0;

    do {
      const page = await clerkClient.users.getUserList({ limit, offset });
      users.push(...page.data);
      totalCount = page.totalCount;
      offset += page.data.length;
    } while (offset < totalCount);

    await db.transaction(async (tx) => {
      for (const user of users) {
        const identity = clerkUserIdentity(user);
        await tx
          .insert(walletProfilesTable)
          .values({
            clerkUserId: user.id,
            displayName: identity.displayName,
            email: identity.email,
            referralCode: `NORTHSTAR-${user.id.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}`,
            verificationStatus: "unverified",
            referralInvitedCount: 0,
            referralReward: "0.00",
            createdAt: new Date(user.createdAt),
          })
          .onConflictDoUpdate({
            target: walletProfilesTable.clerkUserId,
            set: {
              displayName: identity.displayName,
              email: identity.email,
            },
          });
      }
    });

    clerkUserSyncCompletedAt = Date.now();
    return users.length;
  })();

  try {
    return await clerkUserSyncInFlight;
  } finally {
    clerkUserSyncInFlight = null;
  }
}

async function ensureSeededUser(userId: string) {
  const [existing] = await db
    .select()
    .from(walletProfilesTable)
    .where(eq(walletProfilesTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    const sampleProfileUpdate: Partial<typeof walletProfilesTable.$inferInsert> = {};
    if (existing.displayName === "North State Blockchain Member") sampleProfileUpdate.displayName = "Alex Morgan";
    if (existing.verificationStatus === "unverified") sampleProfileUpdate.verificationStatus = "verified";
    if (existing.referralInvitedCount === 0) sampleProfileUpdate.referralInvitedCount = 3;
    if (asNumber(existing.referralReward) === 0) sampleProfileUpdate.referralReward = "50.00";

    // Keep the signed-in email, but replace legacy fallback data with the sample profile.
    if (userId !== "demo_user" && existing.email === "member@northstateblockchain.app") {
      const { email, name } = await fetchClerkUserInfo(userId);
      if (email) sampleProfileUpdate.email = email;
      if (name && existing.displayName !== "North State Blockchain Member") sampleProfileUpdate.displayName = name;
    }
    if (Object.keys(sampleProfileUpdate).length) {
      await db.update(walletProfilesTable).set(sampleProfileUpdate).where(eq(walletProfilesTable.clerkUserId, userId));
      await ensureDefaultPortfolio(userId);
      return { ...existing, ...sampleProfileUpdate };
    }
    await ensureDefaultPortfolio(userId);
    return existing;
  }

  const isDemoUser = userId === "demo_user";

  const displayName = "Alex Morgan";
  let email = isDemoUser ? "alex@example.com" : "member@northstateblockchain.app";

  if (!isDemoUser) {
    const info = await fetchClerkUserInfo(userId);
    if (info.email) email = info.email;
  }

  const [profile] = await db
    .insert(walletProfilesTable)
    .values({
      clerkUserId: userId,
      displayName,
      email,
      referralCode: isDemoUser ? "NORTHSTAR-ALEX" : `NORTHSTAR-ALEX-${userId.slice(-6).toUpperCase()}`,
      verificationStatus: "verified",
      referralInvitedCount: 3,
      referralReward: "50.00",
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
      await ensureDefaultPortfolio(userId);
      return fetched;
    }
  }

  await ensureDefaultPortfolio(userId);

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

const getProfile = async (req: Request, res: Response) => {
  const userId = getUserId(req);
  try {
    const profile = await ensureSeededUser(userId);
    res.json(GetProfileResponse.parse({
      id: String(profile.id),
      name: profile.displayName,
      email: profile.email,
      initials: profile.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
      verificationStatus: profile.verificationStatus,
      referralCode: "NORTHSTAR-ALEX",
      twoFactorEnabled: profile.twoFactorEnabled ?? false,
      smsPhoneNumber: profile.smsPhoneNumber ?? null,
      smsPhoneVerified: profile.smsPhoneVerified ?? false,
    }));
  } catch (error) {
    req.log.error({ err: error, userId }, "Profile database query failed; serving default profile");
    res.json(defaultProfileResponse(userId));
  }
};

router.get("/profile", getProfile);
router.get("/user/profile", getProfile);

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
  try {
    await ensureSeededUser(userId);
    await autoSettleExpiredTrades(userId);
    const account = await getOrCreateTradingAccount(userId);
    const holdings = await db.select().from(holdingsTable).where(eq(holdingsTable.clerkUserId, userId));
    res.json(serializePortfolio(account.balance, holdings.length ? holdings : defaultPortfolioHoldings));
  } catch (error) {
    req.log.error({ err: error, userId }, "Portfolio database query failed; serving default portfolio");
    res.json(serializePortfolio(DEFAULT_PORTFOLIO_BALANCE, defaultPortfolioHoldings));
  }
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
  try {
    await ensureSeededUser(userId);
    const activities = await db
      .select()
      .from(activitiesTable)
      .where(eq(activitiesTable.clerkUserId, userId))
      .orderBy(desc(activitiesTable.createdAt))
      .limit(20);
    res.json(activities.length
      ? GetActivityResponse.parse(activities.map((activity) => ({
          id: String(activity.id),
          type: activity.type,
          asset: activity.asset,
          amount: asNumber(activity.amount),
          value: asNumber(activity.value),
          status: activity.status,
          createdAt: activity.createdAt.toISOString(),
        })))
      : defaultActivityResponse());
  } catch (error) {
    req.log.error({ err: error, userId }, "Activity database query failed; serving default activity");
    res.json(defaultActivityResponse());
  }
});

router.get("/referral", async (req, res) => {
  const userId = getUserId(req);
  try {
    const profile = await ensureSeededUser(userId);
    res.json(GetReferralResponse.parse({
      code: "NORTHSTAR-ALEX",
      invitedCount: profile.referralInvitedCount,
      reward: asNumber(profile.referralReward),
      shareUrl: `${req.protocol}://${req.get("host")}/join/${profile.referralCode}`,
    }));
  } catch (error) {
    req.log.error({ err: error, userId }, "Referral database query failed; serving default referral");
    res.json(GetReferralResponse.parse({
      code: "NORTHSTAR-ALEX",
      invitedCount: 3,
      reward: 50,
      shareUrl: `${req.protocol}://${req.get("host")}/join/NORTHSTAR-ALEX`,
    }));
  }
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
  await syncClerkUsersToWalletProfiles();
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

router.get("/admin/users", requireAdmin, async (_req, res) => {
  await syncClerkUsersToWalletProfiles();
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
      const clerkInfo = await fetchClerkUserInfo(profile.clerkUserId);
      const email = clerkInfo.email || profile.email;
      let accountStatus: AccountOperationalStatus | "deleted" = "active";
      try {
        accountStatus = await getAccountOperationalStatus(profile.clerkUserId);
      } catch (error: unknown) {
        if ((error as { status?: number })?.status === 404) accountStatus = "deleted";
        else throw error;
      }
      return {
        id: String(profile.id),
        clerkUserId: profile.clerkUserId,
        displayName: clerkInfo.name || emailPrefix(email),
        email,
        verificationStatus: profile.verificationStatus,
        referralCode: profile.referralCode,
        totalHoldings,
        createdAt: profile.createdAt.toISOString(),
        accountStatus,
      };
    }),
  );
  res.json(result);
});

router.post("/admin/users/:userId/balance-adjustment", requireAdmin, async (req, res) => {
  const userId = String(req.params.userId);
  const direction = req.body?.direction;
  const rawAmount = String(req.body?.amount ?? "").trim();
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  if (direction !== "credit" && direction !== "debit") {
    res.status(400).json({ error: "Balance adjustment direction must be credit or debit." });
    return;
  }
  const amountString = normalizeStablecoinAmount(rawAmount);
  if (!amountString) {
    res.status(400).json({ error: "Balance adjustment must be between 0 and 1,000,000,000 USDT." });
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

  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${userId}:TRADING_BALANCE`}))`);
    await tx.insert(tradingAccountsTable).values({ clerkUserId: userId }).onConflictDoNothing();
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

    // Credit the canonical account balance without a read-modify-write race.
    await db.insert(tradingAccountsTable).values({ clerkUserId: tx.clerkUserId }).onConflictDoNothing();
    await db.update(tradingAccountsTable).set({
      balance: sql`${tradingAccountsTable.balance} + ${tx.amount}`,
      updatedAt: new Date(),
    }).where(eq(tradingAccountsTable.clerkUserId, tx.clerkUserId));
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
  BTC: 67000, ETH: 3500, BNB: 580, SOL: 145, XRP: 0.52, GOLD: 2348.4,
};

async function getOrCreateTradingAccount(userId: string) {
  await ensureDefaultPortfolio(userId);
  let [acct] = await db.select().from(tradingAccountsTable)
    .where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1);
  if (!acct) {
    await db.insert(tradingAccountsTable)
      .values({ clerkUserId: userId, balance: DEFAULT_PORTFOLIO_BALANCE })
      .onConflictDoNothing();
    [acct] = await db.select().from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, userId)).limit(1);
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

async function settleActiveTrade(tradeId: number, forcedOutcome?: "win" | "loss") {
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
      exitPrice = entry * (1 + (Math.random() * 0.04 - 0.02));
      const priceRose = exitPrice > entry;
      outcome = (trade.direction === "long") === priceRose ? "win" : "loss";
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${trade.clerkUserId}:TRADING_BALANCE`}))`);
    await tx.insert(tradingAccountsTable)
      .values({ clerkUserId: trade.clerkUserId, balance: DEFAULT_PORTFOLIO_BALANCE })
      .onConflictDoNothing();
    await tx.execute(sql`
      select id from ${tradingAccountsTable}
      where ${tradingAccountsTable.clerkUserId} = ${trade.clerkUserId}
      for update
    `);
    const [account] = await tx.select().from(tradingAccountsTable)
      .where(eq(tradingAccountsTable.clerkUserId, trade.clerkUserId)).limit(1);
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

async function autoSettleExpiredTrades(userId: string) {
  const active = await db.select().from(tradesTable)
    .where(and(eq(tradesTable.clerkUserId, userId), eq(tradesTable.status, "active")));
  const now = new Date();
  for (const trade of active) {
    if (trade.expiresAt <= now) {
      await settleActiveTrade(trade.id);
    }
  }
}

router.get("/trading/account", async (req, res) => {
  const userId = getUserId(req);
  await ensureSeededUser(userId);
  await autoSettleExpiredTrades(userId);
  const acct = await getOrCreateTradingAccount(userId);
  res.json({ balance: asNumber(acct.balance), totalTrades: acct.totalTrades, wins: acct.wins, losses: acct.losses });
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
  const amountString = normalizeStablecoinAmount(String(amount));
  if (!amountString) { res.status(400).json({ error: "Amount must be a positive value with up to 8 decimal places." }); return; }
  await ensureSeededUser(userId);
  await getOrCreateTradingAccount(userId);
  let entryPrice: number;
  if (asset.toUpperCase() === "GOLD") {
    entryPrice = investmentQuote("GOLD").price;
  } else try {
    const assets = await fetchMarketAssets(req);
    const found = assets.find((a: { symbol: string; price: number }) => a.symbol === asset.toUpperCase());
    entryPrice = found?.price ?? TRADING_FALLBACK[asset.toUpperCase()] ?? 100;
  } catch {
    entryPrice = TRADING_FALLBACK[asset.toUpperCase()] ?? 100;
  }
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
    const [trade] = await tx.insert(tradesTable).values({
      clerkUserId: userId,
      asset: asset.toUpperCase(),
      direction,
      amount: amountString,
      timeframeSecs,
      entryPrice: String(entryPrice),
      expiresAt,
      payoutRate: "0.85",
    }).returning();
    await tx.update(tradingAccountsTable).set({
      totalTrades: sql`${tradingAccountsTable.totalTrades} + 1`,
      updatedAt: now,
    }).where(eq(tradingAccountsTable.clerkUserId, userId));
    return { trade, balance: availableAccount.balance };
  });
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