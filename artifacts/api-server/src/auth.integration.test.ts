import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { tradesTable, tradingAccountsTable } from "@workspace/db";

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
    getUser.mockResolvedValue({ privateMetadata: {} });
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
    ["session cookie", { cookie: "__session=restored" }],
    ["authorization header", { authorization: "Bearer restored-token" }],
  ])("accepts KYC submission from a restored %s", async (_label, authHeaders) => {
    const submittedAt = new Date("2026-09-14T00:00:00.000Z");
    transaction.mockImplementation(async (callback) => callback({
      execute: vi.fn(),
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
      insert: () => {
        values: (values: Record<string, unknown>) => Promise<void> | {
          returning: () => Promise<Array<Record<string, unknown>>>;
        };
      };
    }) => Promise<unknown>) => {
      let insertCount = 0;
      return callback({
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

  it("returns updated Spot and Futures allocations for both transfer directions", async () => {
    select.mockImplementation(() => ({
      from: (table: unknown) => ({
        where: () => table === tradesTable
          ? Promise.resolve([])
          : { limit: async () => [profile] },
      }),
    }));
    const account = {
      id: 1, balance: "100.00000000", futuresBalance: "0.00000000",
      totalTrades: 0, wins: 0, losses: 0,
    };
    const updatedBalances = ["40.00000000", "25.00000000"];
    transaction.mockImplementation(async (callback) => callback({
      execute: vi.fn(),
      insert: () => ({
        values: () => ({ onConflictDoNothing: async () => undefined }),
      }),
      select: () => ({
        from: (table: unknown) => ({
          where: () => table === tradingAccountsTable
            ? { limit: async () => [account] }
            : Promise.resolve([{ spot: "0", futures: "0" }]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: async () => [{
              ...account, futuresBalance: updatedBalances.shift(),
            }],
          }),
        }),
      }),
    }));

    for (const [direction, amount, spot, futures] of [
      ["spot_to_futures", "40", 60, 40],
      ["futures_to_spot", "15", 75, 25],
    ] as const) {
      const response = await fetch(`${baseUrl}/api/trading/transfer`, {
        method: "POST",
        headers: { cookie: "__session=restored", "content-type": "application/json" },
        body: JSON.stringify({ direction, amount }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        balance: futures, spotBalance: spot, futuresBalance: futures,
        availableSpotBalance: spot, availableFuturesBalance: futures, totalBalance: 100,
      });
    }
  });

  it("rejects malformed transfer amounts and requires authentication", async () => {
    const headers = { cookie: "__session=restored", "content-type": "application/json" };
    for (const amount of ["0", "1.000000001", "1e2", "1000000001"]) {
      const response = await fetch(`${baseUrl}/api/trading/transfer`, {
        method: "POST", headers,
        body: JSON.stringify({ direction: "spot_to_futures", amount }),
      });
      expect(response.status).toBe(400);
    }
    const response = await fetch(`${baseUrl}/api/trading/transfer`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ direction: "spot_to_futures", amount: "1" }),
    });
    expect(response.status).toBe(401);
  });
});