import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { clerkMiddleware, getAuth, getUser, select, transaction, update, insert } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, { userId: string | null }>();
  const getUser = vi.fn();
  const select = vi.fn();
  const transaction = vi.fn();
  const update = vi.fn();
  const insert = vi.fn();

  return {
    getUser,
    select,
    transaction,
    update,
    insert,
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
      update,
      insert,
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
      primaryEmailAddressId: "email_primary",
      emailAddresses: [{ id: "email_primary", emailAddress: "alex@example.com" }],
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
    update.mockReset();
    insert.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves public liveness without Clerk or database access", async () => {
    const response = await fetch(`${baseUrl}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(getUser).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it("allows the custom domain, admin domain, all HTTPS Vercel deployments, and configured origins", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://additional.example.org");
    for (const origin of [
      "https://northstateblockchain.com",
      "https://www.northstateblockchain.com",
      "https://north-state-blockchain-admin-panel.vercel.app",
      "https://northstateblockchain.vercel.app",
      "https://unrelated-project.vercel.app",
      "https://additional.example.org",
    ]) {
      const response = await fetch(`${baseUrl}/api/health`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization,x-admin-key" },
      });
      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe(origin);
      expect(response.headers.get("access-control-allow-credentials")).toBe("true");
      expect(response.headers.get("access-control-allow-headers")).toContain("Authorization");
      expect(response.headers.get("access-control-allow-headers")).toContain("X-Admin-Key");
      expect(response.headers.get("vary")).toContain("Origin");
    }

    for (const origin of [
      "http://preview.vercel.app",
      "https://vercel.app",
      "https://preview.vercel.app.attacker.example",
      "https://preview.vercel.app:8443",
      "https://preview.vercel.app/path",
    ]) {
      const blocked = await fetch(`${baseUrl}/api/health`, {
        method: "OPTIONS",
        headers: { origin, "access-control-request-method": "GET" },
      });
      expect(blocked.status).toBe(403);
      expect(blocked.headers.get("access-control-allow-origin")).toBeNull();
      expect(blocked.headers.get("vary")).toContain("Origin");
    }
    expect(getUser).not.toHaveBeenCalled();
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

  it("updates the saved email from Clerk's primary address without replacing a custom display name", async () => {
    const saved = {
      ...profile,
      email: "old@example.com",
      displayName: "My chosen name",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    };
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [saved] }) }) });
    update.mockImplementation(() => ({
      set: (changes: Partial<typeof saved>) => ({
        where: async () => { Object.assign(saved, changes); },
      }),
    }));
    getUser.mockResolvedValue({
      privateMetadata: {},
      primaryEmailAddressId: "email_current",
      emailAddresses: [
        { id: "email_old", emailAddress: "old@example.com" },
        { id: "email_current", emailAddress: "current@example.com" },
      ],
      firstName: "Alex",
      lastName: "Morgan",
    });

    const response = await fetch(`${baseUrl}/api/profile`, { headers: { authorization: "Bearer restored-token" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "My chosen name",
      email: "current@example.com",
      referralCode: profile.referralCode,
    });
    expect(saved.email).toBe("current@example.com");
    expect(saved.displayName).toBe("My chosen name");
    expect(update).toHaveBeenCalledTimes(1);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("repairs an older saved profile's empty identity without creating a trading balance", async () => {
    const saved = {
      ...profile,
      email: "",
      displayName: "North State Blockchain Member",
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    };
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [saved] }) }) });
    update.mockImplementation(() => ({
      set: (changes: Partial<typeof saved>) => ({
        where: async () => { Object.assign(saved, changes); },
      }),
    }));

    const response = await fetch(`${baseUrl}/api/profile`, { headers: { cookie: "__session=restored" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: "Alex Morgan", email: "alex@example.com" });
    expect(saved.email).toBe("alex@example.com");
    expect(saved.displayName).toBe("Alex Morgan");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("persists Clerk identity and a zero-balance account for a first-time member", async () => {
    let savedIdentity: Record<string, unknown> | undefined;
    const insertTradingAccount = vi.fn();
    select.mockReturnValue({ from: () => ({ where: () => ({ limit: async () => [] }) }) });
    insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => {
        savedIdentity = values;
        return {
          onConflictDoNothing: () => ({
            returning: async () => [{ ...profile, ...values, id: 2, createdAt: new Date() }],
          }),
        };
      },
    }));
    transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        execute: async () => undefined,
        select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
        insert: () => ({
          values: (values: unknown) => {
            insertTradingAccount(values);
            return { onConflictDoNothing: async () => undefined };
          },
        }),
      }),
    );

    const response = await fetch(`${baseUrl}/api/profile`, { headers: { cookie: "__session=restored" } });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: "2",
      name: "Alex Morgan",
      email: "alex@example.com",
      verificationStatus: "unverified",
    });
    expect(savedIdentity).toMatchObject({ clerkUserId: "user_restored", email: "alex@example.com", displayName: "Alex Morgan" });
    expect(insertTradingAccount).toHaveBeenCalledWith({ clerkUserId: "user_restored", balance: "0" });
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
});