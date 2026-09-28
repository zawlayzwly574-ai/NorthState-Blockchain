import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  select,
  transaction,
  update,
  insert,
  txInsert,
  txUpdate,
  clerkMiddleware,
  getAuth,
  getUser,
} = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  txInsert: vi.fn(),
  txUpdate: vi.fn(),
  clerkMiddleware: vi.fn(() => (_request: unknown, _response: unknown, next: () => void) => next()),
  getAuth: vi.fn(() => ({ userId: "financial_safety_member" })),
  getUser: vi.fn(async () => ({ privateMetadata: { accountStatus: "active" } })),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser, updateUserMetadata: vi.fn(), deleteUser: vi.fn() } },
  clerkMiddleware,
  getAuth,
}));

vi.mock("@workspace/db", async () => {
  const schema = await import("@workspace/db/schema");
  return {
    ...schema,
    db: { select, transaction, update, insert },
  };
});

vi.mock("./middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/api/__clerk",
  clerkProxyMiddleware: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  getClerkProxyHost: () => undefined,
}));

import app from "./app";
import {
  tradesTable,
  tradingAccountsTable,
  walletProfilesTable,
} from "@workspace/db/schema";

const memberId = "financial_safety_member";
const memberProfile = {
  id: 101,
  clerkUserId: memberId,
  displayName: "Safety Member",
  email: "safety@example.com",
  verificationStatus: "verified",
  referralCode: "SAFETY-MEMBER",
  referralInvitedCount: 0,
  referralReward: "0",
  twoFactorEnabled: false,
  smsPhoneNumber: null,
  smsPhoneVerified: false,
  createdAt: new Date(),
};
const persistedAccount = {
  id: 202,
  clerkUserId: memberId,
  balance: "50000.00000000",
  futuresBalance: "0",
  totalTrades: 1,
  wins: 0,
  losses: 0,
  tradeOutcomeMode: "auto",
  createdAt: new Date(),
  updatedAt: new Date(),
};
const expiredActiveTrade = {
  id: 303,
  clerkUserId: memberId,
  asset: "BTC",
  direction: "long",
  amount: "5000.00000000",
  timeframeSecs: 60,
  status: "active",
  result: null,
  adminOverride: null,
  entryPrice: "65000.00000000",
  exitPrice: null,
  payout: null,
  payoutRate: "0.30",
  createdAt: new Date(Date.now() - 120_000),
  expiresAt: new Date(Date.now() - 60_000),
  settledAt: null,
};
let tradeRows: unknown[] = [expiredActiveTrade];

function rowsForTable(table: unknown) {
  if (table === walletProfilesTable) return [memberProfile];
  if (table === tradingAccountsTable) return [persistedAccount];
  if (table === tradesTable) return tradeRows;
  return [];
}

function queryForTable(table: unknown) {
  const query: {
    where: () => typeof query;
    orderBy: () => typeof query;
    limit: () => Promise<unknown[]>;
    then: (resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) => Promise<unknown>;
  } = {
    where: () => query,
    orderBy: () => query,
    limit: async () => rowsForTable(table),
    then: (resolve, reject) => Promise.resolve(rowsForTable(table)).then(resolve, reject),
  };
  return query;
}

function makeTransactionClient() {
  return {
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({ from: (table: unknown) => queryForTable(table) })),
    insert: txInsert,
    update: txUpdate,
  };
}

describe("financial market data fails closed", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", (error) => {
        if (error) throw error;
        resolve();
      });
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    tradeRows = [expiredActiveTrade];
    select.mockReset().mockImplementation(() => ({
      from: (table: unknown) => queryForTable(table),
    }));
    transaction.mockReset().mockImplementation(async (callback: (tx: ReturnType<typeof makeTransactionClient>) => Promise<unknown>) =>
      callback(makeTransactionClient()));
    update.mockReset();
    insert.mockReset();
    txInsert.mockReset().mockImplementation(() => ({
      values: () => ({ returning: async () => [] }),
    }));
    txUpdate.mockReset().mockImplementation(() => ({
      set: () => ({ where: async () => undefined }),
    }));
    getUser.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty market chart when the provider has no history", async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const providerFetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith(baseUrl)) return nativeFetch(input, init);
      if (url.includes("/simple/price")) {
        const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
        return new Response(JSON.stringify(Object.fromEntries(ids.map((id) => [
          id,
          { usd: 10, usd_24h_change: 0.5, usd_market_cap: 1000, usd_24h_vol: 100 },
        ]))), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/market_chart")) {
        return new Response(JSON.stringify({ prices: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal("fetch", providerFetch);

    const response = await fetch(`${baseUrl}/api/markets/btc`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ asset: { symbol: "BTC", price: 10 }, chart: [] });
    expect(select).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns 503 instead of an invented FX table when the provider is unavailable", async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(baseUrl)) return nativeFetch(input, init);
      return new Response("unavailable", { status: 503 });
    }));

    const response = await fetch(`${baseUrl}/api/markets/fx-rates`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Current FX rates are unavailable." });
    expect(select).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("returns no Mining Place prices instead of fallback quotes", async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(baseUrl)) return nativeFetch(input, init);
      return new Response("unavailable", { status: 503 });
    }));

    const response = await fetch(`${baseUrl}/api/mining-place`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ assets: [] });
    expect(select).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects a spot trade without a fresh provider quote and performs no financial writes", async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(baseUrl)) return nativeFetch(input, init);
      return new Response("unavailable", { status: 503 });
    }));

    const response = await fetch(`${baseUrl}/api/trading/trades`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ asset: "BTC", direction: "long", amount: 5000, timeframeSecs: 60 }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("trade was not placed") });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(txInsert).not.toHaveBeenCalled();
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it("serves persisted account and active trade data when automatic settlement has no quote", async () => {
    const nativeFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).startsWith(baseUrl)) return nativeFetch(input, init);
      return new Response("unavailable", { status: 503 });
    }));

    const accountResponse = await fetch(`${baseUrl}/api/trading/account`);
    expect(accountResponse.status).toBe(200);
    expect(await accountResponse.json()).toMatchObject({ balance: 50000, totalTrades: 1 });

    const tradesResponse = await fetch(`${baseUrl}/api/trading/trades`);
    expect(tradesResponse.status).toBe(200);
    expect(await tradesResponse.json()).toMatchObject([
      { id: expiredActiveTrade.id, status: "active", result: null },
    ]);
    expect(txUpdate).not.toHaveBeenCalled();
    expect(txInsert).not.toHaveBeenCalled();
  });

  it("hides stored policy exit levels for administrator-controlled trades", async () => {
    tradeRows = [{
      ...expiredActiveTrade,
      id: 404,
      status: "completed",
      result: "win",
      adminOverride: "win",
      exitPrice: "65650.00000000",
      payout: "1500.00000000",
      settledAt: new Date(),
    }];

    const response = await fetch(`${baseUrl}/api/trading/trades`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject([
      { id: 404, adminOverride: "win", exitPrice: null, payout: 1500 },
    ]);
  });
});