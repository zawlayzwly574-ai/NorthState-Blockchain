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
      request: { headers: { cookie?: string } },
      _response: unknown,
      next: () => void,
    ) => {
      const session = request.headers.cookie?.match(/__session=([^;]+)/)?.[1];
      authByRequest.set(request, {
        userId: session === "restored"
          ? "user_restored"
          : session === "suspended"
            ? "user_suspended"
            : session === "frozen_profile"
              ? "user_frozen_profile"
            : session === "frozen"
              ? "user_frozen"
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

  it("returns fallback portfolio JSON for an authenticated session when database work fails", async () => {
    transaction.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/portfolio`, {
      headers: { cookie: "__session=restored" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toMatchObject({
      totalValue: 24680.42,
      holdings: expect.arrayContaining([
        expect.objectContaining({ symbol: "BTC" }),
        expect.objectContaining({ symbol: "ETH" }),
        expect.objectContaining({ symbol: "USDC" }),
      ]),
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

  it("returns one 401 without invoking member data access when authentication is missing", async () => {
    const response = await fetch(`${baseUrl}/api/profile`);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(getUser).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("returns one 403 without invoking a financial handler for a suspended user", async () => {
    getUser.mockResolvedValue({ privateMetadata: { accountStatus: "suspended" } });

    const response = await fetch(`${baseUrl}/api/transactions/deposit`, {
      method: "POST",
      headers: {
        cookie: "__session=suspended",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        asset: "BTC",
        amount: 0.01,
        txHash: "blocked-proof-hash",
        proofPath: null,
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "This account is suspended.",
      accountStatus: "suspended",
    });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("user_suspended");
    expect(select).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("allows a frozen user to reach the non-financial profile handler", async () => {
    getUser.mockResolvedValue({ privateMetadata: { accountStatus: "frozen" } });

    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=frozen_profile" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "1",
      name: "Alex Morgan",
      email: "alex@example.com",
    });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("user_frozen_profile");
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("returns one 403 without invoking member data access for a frozen user's financial request", async () => {
    getUser.mockResolvedValue({ privateMetadata: { accountStatus: "frozen" } });

    const response = await fetch(`${baseUrl}/api/portfolio`, {
      headers: { cookie: "__session=frozen" },
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "This account is frozen and cannot perform this operation.",
      accountStatus: "frozen",
    });
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(getUser).toHaveBeenCalledWith("user_frozen");
    expect(select).not.toHaveBeenCalled();
  });
});