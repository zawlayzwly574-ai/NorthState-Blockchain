import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { clerkMiddleware, getAuth, getUser, select, transaction } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, { userId: string | null }>();
  const getUser = vi.fn();
  const select = vi.fn();
  const transaction = vi.fn();

  return {
    getUser,
    select,
    transaction,
    getAuth: vi.fn((request: object) => authByRequest.get(request) ?? { userId: null }),
    clerkMiddleware: () => (
      request: { headers: { cookie?: string; authorization?: string } },
      _response: unknown,
      next: () => void,
    ) => {
      authByRequest.set(request, {
        userId: request.headers.cookie?.includes("__session=restored")
          || request.headers.authorization === "Bearer restored-token"
          ? "user_restored"
          : null,
      });
      next();
    },
  };
});

vi.mock("@clerk/express", () => ({
  clerkClient: {
    users: {
      getUser,
      updateUserMetadata: vi.fn(),
    },
  },
  clerkMiddleware,
  getAuth,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select,
      transaction,
    },
  };
});

vi.mock("./middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/api/__clerk",
  clerkProxyMiddleware: () => (
    _request: unknown,
    _response: unknown,
    next: () => void,
  ) => next(),
  getClerkProxyHost: () => undefined,
}));

import app from "./app";

const profile = {
  id: 1,
  clerkUserId: "user_restored",
  displayName: "Alex Morgan",
  email: "alex@example.com",
  verificationStatus: "verified",
  referralCode: "NORTHSTAR-ALEX-TORED",
  referralInvitedCount: 3,
  referralReward: "50.00",
  twoFactorEnabled: false,
  smsPhoneNumber: null,
  smsPhoneVerified: false,
  createdAt: new Date(),
};

describe("member route authentication", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", (error) => {
        if (error) throw error;
        resolve();
      });
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  beforeEach(() => {
    getUser.mockReset();
    getUser.mockResolvedValue({
      privateMetadata: {},
      emailAddresses: [{
        id: "email_1",
        emailAddress: "alex@example.com",
        verification: { status: "verified" },
      }],
      primaryEmailAddressId: "email_1",
      firstName: "Alex",
      lastName: "Morgan",
    });
    select.mockReset();
    select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [profile],
        }),
      }),
    });
    transaction.mockReset();
    transaction.mockResolvedValue(undefined);
  });

  it("accepts a restored Clerk session and reaches the member handler", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "1",
      name: "Alex Morgan",
      email: "alex@example.com",
    });
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("restores a verified legacy profile and balances when the Clerk user ID changed", async () => {
    const currentProfile = {
      ...profile,
      clerkUserId: "user_restored",
      verificationStatus: "unverified",
      referralInvitedCount: 0,
      referralReward: "0",
      twoFactorEnabled: false,
      smsPhoneNumber: null,
      smsPhoneVerified: false,
      totpSecret: null,
    };
    const legacyProfile = {
      ...profile,
      clerkUserId: "user_previous_instance",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    };
    const currentAccount = {
      clerkUserId: "user_restored",
      balance: "0",
      futuresBalance: "0",
      totalTrades: 0,
      wins: 0,
      losses: 0,
      tradeOutcomeMode: "auto",
    };
    const legacyAccount = {
      clerkUserId: "user_previous_instance",
      balance: "2500",
      futuresBalance: "700",
      totalTrades: 12,
      wins: 8,
      losses: 4,
      tradeOutcomeMode: "auto",
    };
    let dbSelectCount = 0;
    select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => dbSelectCount++ === 0 ? [currentProfile] : [],
        }),
      }),
    }));

    const transactionSelectResults: Array<Array<Record<string, unknown>>> = [
      [currentProfile],
      [currentProfile, legacyProfile],
      [currentAccount],
      [legacyAccount],
    ];
    const updatedTables: unknown[] = [];
    const deletedTables: unknown[] = [];
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      execute: async () => ({ rows: [{ has_owned_data: false }] }),
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => transactionSelectResults.shift() ?? [] }),
        }),
      }),
      update: (table: unknown) => {
        updatedTables.push(table);
        return { set: () => ({ where: async () => undefined }) };
      },
      delete: (table: unknown) => {
        deletedTables.push(table);
        return { where: async () => undefined };
      },
    }));

    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "1",
      name: "Alex Morgan",
      email: "alex@example.com",
      verificationStatus: "verified",
      referralCode: "NORTHSTAR-ALEX-TORED",
    });
    expect(updatedTables).toHaveLength(11);
    expect(deletedTables).toHaveLength(2);
    expect(transactionSelectResults).toHaveLength(0);
  });

  it("does not reattach an account when the verified email matches multiple legacy profiles", async () => {
    const currentProfile = {
      ...profile,
      clerkUserId: "user_restored",
      verificationStatus: "unverified",
      referralInvitedCount: 0,
      referralReward: "0",
      twoFactorEnabled: false,
      smsPhoneNumber: null,
      smsPhoneVerified: false,
      totpSecret: null,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    };
    const legacyProfiles = [
      { ...profile, clerkUserId: "user_previous_instance" },
      { ...profile, id: 2, clerkUserId: "user_another_instance", referralCode: "NORTHSTAR-ANOTHER" },
    ];
    select.mockReturnValue({
      from: () => ({
        where: () => ({ limit: async () => [currentProfile] }),
      }),
    });

    const transactionSelectResults: Array<Array<Record<string, unknown>>> = [
      [currentProfile],
      [currentProfile, ...legacyProfiles],
    ];
    const updatedTables: unknown[] = [];
    const deletedTables: unknown[] = [];
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      execute: vi.fn(),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => transactionSelectResults.shift() ?? [],
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      update: (table: unknown) => {
        updatedTables.push(table);
        return { set: () => ({ where: async () => undefined }) };
      },
      delete: (table: unknown) => {
        deletedTables.push(table);
        return { where: async () => undefined };
      },
    }));

    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "1",
      verificationStatus: "unverified",
    });
    expect(updatedTables).toHaveLength(0);
    expect(deletedTables).toHaveLength(0);
  });

  it("returns updated Spot and Futures balances for a verified member's transfer", async () => {
    let spot = 75;
    let futures = 25;
    const account = () => ({
      clerkUserId: "user_restored",
      balance: spot.toFixed(8),
      futuresBalance: futures.toFixed(8),
      totalTrades: 0,
      wins: 0,
      losses: 0,
    });
    const update = vi.fn();
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        execute: async () => undefined,
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [account()] }) }) }),
        update: (...args: unknown[]) => {
          update(...args);
          return {
            set: () => ({
              where: () => ({
                returning: async () => [account()],
              }),
            }),
          };
        },
      }),
    );

    for (const [direction, nextSpot, nextFutures] of [
      ["spot_to_futures", 75, 25],
      ["futures_to_spot", 90, 10],
    ] as const) {
      spot = nextSpot;
      futures = nextFutures;
      const response = await fetch(`${baseUrl}/api/trading/transfer`, {
        method: "POST",
        headers: { cookie: "__session=restored", "content-type": "application/json" },
        body: JSON.stringify({ direction, amount: "15" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ balance: spot, futuresBalance: futures });
    }
    expect(update).toHaveBeenCalledTimes(2);

    const invalid = await fetch(`${baseUrl}/api/trading/transfer`, {
      method: "POST",
      headers: { cookie: "__session=restored", "content-type": "application/json" },
      body: JSON.stringify({ direction: "spot_to_futures", amount: "0" }),
    });
    expect(invalid.status).toBe(400);
    expect(update).toHaveBeenCalledTimes(2);

    const anonymous = await fetch(`${baseUrl}/api/trading/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction: "spot_to_futures", amount: "1" }),
    });
    expect(anonymous.status).toBe(401);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("returns the standard user profile for a logged-in unverified member", async () => {
    select.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...profile, verificationStatus: "unverified" }],
        }),
      }),
    });

    const response = await fetch(`${baseUrl}/api/user`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "1",
      name: "Alex Morgan",
      verificationStatus: "unverified",
    });
  });

  it.each([
    ["verified", "verified"],
    ["pending", "unverified"],
    ["rejected", "unverified"],
  ])("restores prior KYC access only when the latest submission is %s", async (latestStatus, expectedStatus) => {
    const legacyProfile = {
      ...profile,
      verificationStatus: "unverified",
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    };
    select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: async () => [legacyProfile] }),
      }),
    });
    getUser.mockResolvedValue({
      privateMetadata: {},
      emailAddresses: [{
        id: "email_1",
        emailAddress: "alex@example.com",
        verification: { status: "unverified" },
      }],
      primaryEmailAddressId: "email_1",
      firstName: "Alex",
      lastName: "Morgan",
    });
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({ limit: async () => [{ status: latestStatus }] }),
          }),
        }),
      }),
      update: () => ({ set: () => ({ where: async () => undefined }) }),
    }));

    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verificationStatus: expectedStatus });
  });

  it.each([
    ["session cookie", { cookie: "__session=restored" }],
    ["authorization header", { authorization: "Bearer restored-token" }],
  ])("accepts KYC submission from a restored %s", async (_label, authHeaders) => {
    const submittedAt = new Date("2026-09-14T00:00:00.000Z");
    transaction.mockImplementation(async (callback) => callback({
      execute: vi.fn(),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [{
              clerkUserId: "user_restored",
              balance: "100",
              futuresBalance: "0",
            }],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{ status: "pending", submittedAt }],
        }),
      }),
      update: () => ({
        set: () => ({
          where: async () => undefined,
        }),
      }),
    }));
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(96, 1),
    ]);

    const response = await fetch(`${baseUrl}/api/kyc`, {
      method: "POST",
      headers: {
        ...authHeaders,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        fullName: "Alex Morgan",
        country: "United States",
        city: "New York",
        occupation: "Engineer",
        documentType: "passport",
        documentImageBase64: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      success: true,
      status: "pending",
    });
  });

  it("keeps Clerk authentication when submitting deposit proof", async () => {
    const insertedValues: Array<Record<string, unknown>> = [];
    transaction.mockImplementation(async (callback: (tx: {
      execute: (...args: unknown[]) => Promise<void>;
      select: () => {
        from: () => {
          where: (...args: unknown[]) => {
            limit: () => Promise<Array<Record<string, unknown>>>;
          };
        };
      };
      insert: () => {
        values: (values: Record<string, unknown>) => Promise<void> | {
          returning: () => Promise<Array<Record<string, unknown>>>;
        };
      };
    }) => Promise<unknown>) => {
      let insertCount = 0;
      return callback({
        execute: async () => undefined,
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{
                clerkUserId: "user_restored",
                balance: "100",
                futuresBalance: "0",
              }],
            }),
          }),
        }),
        insert: () => ({
          values: (values) => {
            insertedValues.push(values);
            insertCount += 1;
            if (insertCount === 1) {
              return {
                returning: async () => [{
                  id: 42,
                  asset: values.asset,
                  amount: values.amount,
                  status: "pending",
                  createdAt: new Date("2026-09-10T00:00:00.000Z"),
                }],
              };
            }
            return Promise.resolve();
          },
        }),
      });
    });

    const response = await fetch(`${baseUrl}/api/transactions/deposit`, {
      method: "POST",
      headers: {
        cookie: "__session=restored",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        asset: "BTC",
        amount: 0.01,
        txHash: "proof-hash-1234",
        proofPath: null,
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "42",
      type: "deposit",
      asset: "BTC",
      amount: 0.01,
      status: "pending",
    });
    expect(insertedValues[0]).toMatchObject({
      clerkUserId: "user_restored",
      txHash: "proof-hash-1234",
      proofPath: null,
    });
  });

  it("blocks wallet mutations until KYC receives admin approval", async () => {
    select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          limit: async () => [{ ...profile, verificationStatus: "unverified" }],
        }),
      }),
    });

    const response = await fetch(`${baseUrl}/api/transactions/withdraw`, {
      method: "POST",
      headers: {
        cookie: "__session=restored",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        asset: "ETH",
        amount: 0.1,
        destination: "0x1234567890",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      verificationStatus: "unverified",
    });
  });

  it("returns one 401 without invoking member data access when authentication is missing", async () => {
    const response = await fetch(`${baseUrl}/api/profile`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(getUser).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("does not offer fallback prices or accept investments when market quotes are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const marketFetch = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes("finance.yahoo.com")
        ? marketFetch()
        : originalFetch(input, init);
    });

    try {
      const marketResponse = await originalFetch(`${baseUrl}/api/mining-place`);
      expect(marketResponse.status).toBe(503);
      expect(await marketResponse.json()).toMatchObject({
        error: "Market quotes are temporarily unavailable. Please try again.",
      });
      expect(marketFetch).toHaveBeenCalled();

      const investmentResponse = await originalFetch(`${baseUrl}/api/mining-investments`, {
        method: "POST",
        headers: {
          cookie: "__session=restored",
          "content-type": "application/json",
        },
        body: JSON.stringify({ symbol: "AAPL", amount: 25 }),
      });
      expect(investmentResponse.status).toBe(503);
      expect(await investmentResponse.json()).toMatchObject({
        error: "A live market quote is temporarily unavailable for this asset. Please try again.",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not open a spot trade at a fallback price when market providers are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const providerFetch = vi.fn(async () => new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", (input: string | URL | Request, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes("api.coingecko.com") || url.includes("api.binance.com") || url.includes("api.coinpaprika.com")
        ? providerFetch()
        : originalFetch(input, init);
    });

    try {
      const response = await originalFetch(`${baseUrl}/api/trading/trades`, {
        method: "POST",
        headers: {
          cookie: "__session=restored",
          "content-type": "application/json",
        },
        body: JSON.stringify({ asset: "BTC", direction: "long", amount: 5000, timeframeSecs: 60 }),
      });

      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        error: "A fresh market price is unavailable. The order was not opened.",
      });
      expect(providerFetch).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fills markets from canonical CoinPaprika quotes when CoinGecko and Binance are unavailable", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("api.coingecko.com")) return new Response(null, { status: 429 });
      if (url.includes("api.binance.com")) return new Response(null, { status: 451 });
      if (url.includes("api.coinpaprika.com/v1/tickers")) {
        return Response.json([
          {
            id: "usdc-ccip-bridged-usdc-ronin",
            name: "CCIP Bridged USDC (Ronin)",
            symbol: "USDC",
            rank: 1,
            quotes: { USD: { price: 0.91, percent_change_24h: 3 } },
          },
          {
            id: "usdc-usd-coin",
            name: "USDC",
            symbol: "USDC",
            rank: 6,
            quotes: { USD: { price: 1, percent_change_24h: 0.01 } },
          },
          {
            id: "btc-bitcoin",
            name: "Bitcoin",
            symbol: "BTC",
            rank: 1,
            quotes: { USD: { price: 84_000, percent_change_24h: 1.25 } },
          },
        ]);
      }
      return originalFetch(input);
    });

    try {
      const response = await originalFetch(`${baseUrl}/api/markets`);
      expect(response.status).toBe(200);
      const assets = await response.json() as Array<{ symbol: string; price: number }>;
      expect(assets.find((asset) => asset.symbol === "BTC")?.price).toBe(84_000);
      expect(assets.find((asset) => asset.symbol === "USDC")?.price).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});