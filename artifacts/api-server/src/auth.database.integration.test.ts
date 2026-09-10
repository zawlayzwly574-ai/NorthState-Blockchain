import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL is required for the database-backed authentication test.",
  );
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be different from DATABASE_URL to protect development and production data.",
  );
}
process.env.DATABASE_URL = testDatabaseUrl;

const { authenticatedUserId, firstTimeUserId, overlappingUserId, clerkMiddleware, getAuth, getUser } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, { userId: string | null }>();
  const authenticatedUserId = `database_test_${crypto.randomUUID()}`;
  const firstTimeUserId = `database_new_${crypto.randomUUID()}`;
  const overlappingUserId = `database_overlap_${crypto.randomUUID()}`;
  const getUser = vi.fn(async (userId: string) => ({
    privateMetadata: {},
    emailAddresses: [
      {
        emailAddress:
          userId === overlappingUserId
            ? "overlap-database-test@example.invalid"
            : userId === firstTimeUserId
              ? "first-time-database-test@example.invalid"
              : "database-test@example.invalid",
      },
    ],
    firstName:
      userId === overlappingUserId
        ? "Overlap"
        : userId === firstTimeUserId
          ? "First-time"
          : "Database",
    lastName: "Member",
  }));

  return {
    authenticatedUserId,
    firstTimeUserId,
    overlappingUserId,
    getUser,
    getAuth: vi.fn((request: object) => authByRequest.get(request) ?? { userId: null }),
    clerkMiddleware: () => (
      request: { headers: { cookie?: string } },
      _response: unknown,
      next: () => void,
    ) => {
      authByRequest.set(request, {
        userId: request.headers.cookie?.includes("__session=database-overlap")
          ? overlappingUserId
          : request.headers.cookie?.includes("__session=database-first-time")
            ? firstTimeUserId
            : request.headers.cookie?.includes("__session=database-restored")
              ? authenticatedUserId
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

vi.mock("./middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/api/__clerk",
  clerkProxyMiddleware: () => (
    _request: unknown,
    _response: unknown,
    next: () => void,
  ) => next(),
  getClerkProxyHost: () => undefined,
}));

describe("database-backed member authentication", () => {
  const clerkUserId = authenticatedUserId;
  const newClerkUserId = firstTimeUserId;
  const overlapClerkUserId = overlappingUserId;
  const referralCode = `DB-AUTH-${randomUUID()}`;
  let server: Server;
  let baseUrl: string;
  let pool: typeof import("@workspace/db").pool;

  beforeAll(async () => {
    ({ pool } = await import("@workspace/db"));
    await removeTestMember();
    await removeFirstTimeMember();
    await removeOverlapMember();
    await pool.query(
      `insert into wallet_profiles
        (clerk_user_id, display_name, email, verification_status, referral_code)
       values ($1, $2, $3, $4, $5)`,
      [
        clerkUserId,
        "Database Test Member",
        "database-test@example.invalid",
        "verified",
        referralCode,
      ],
    );

    const { default: app } = await import("./app");
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
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (pool) {
      await removeTestMember();
      await removeFirstTimeMember();
      await removeOverlapMember();
      await pool.end();
    }
  });

  afterEach(async () => {
    await removeFirstTimeMember();
    await removeOverlapMember();
  });

  async function removeMember(userId: string) {
    await pool.query("delete from trades where clerk_user_id = $1", [userId]);
    await pool.query("delete from wallet_activities where clerk_user_id = $1", [userId]);
    await pool.query("delete from wallet_holdings where clerk_user_id = $1", [userId]);
    await pool.query("delete from trading_accounts where clerk_user_id = $1", [userId]);
    await pool.query("delete from wallet_profiles where clerk_user_id = $1", [userId]);
  }

  async function removeTestMember() {
    await removeMember(clerkUserId);
  }

  async function removeFirstTimeMember() {
    await removeMember(newClerkUserId);
  }

  async function removeOverlapMember() {
    await removeMember(overlapClerkUserId);
  }

  it("loads an authenticated member through the real profile query", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=database-restored" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Database Test Member",
      email: "database-test@example.invalid",
      verificationStatus: "verified",
    });

    const persisted = await pool.query(
      "select display_name, email from wallet_profiles where clerk_user_id = $1",
      [clerkUserId],
    );
    expect(persisted.rows).toEqual([
      {
        display_name: "Database Test Member",
        email: "database-test@example.invalid",
      },
    ]);
  });

  it("creates a profile and starter portfolio for a first-time authenticated member", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=database-first-time" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "Alex Morgan",
      email: "first-time-database-test@example.invalid",
      verificationStatus: "verified",
    });

    const [profiles, holdings, activities, accounts] = await Promise.all([
      pool.query(
        "select display_name, email from wallet_profiles where clerk_user_id = $1",
        [newClerkUserId],
      ),
      pool.query(
        "select symbol from wallet_holdings where clerk_user_id = $1 order by symbol",
        [newClerkUserId],
      ),
      pool.query(
        "select type from wallet_activities where clerk_user_id = $1",
        [newClerkUserId],
      ),
      pool.query(
        "select balance from trading_accounts where clerk_user_id = $1",
        [newClerkUserId],
      ),
    ]);

    expect(profiles.rows).toEqual([
      {
        display_name: "Alex Morgan",
        email: "first-time-database-test@example.invalid",
      },
    ]);
    expect(holdings.rows.map(({ symbol }) => symbol)).toEqual([
      "BNB",
      "BTC",
      "ETH",
      "USDC",
      "USDT",
    ]);
    expect(activities.rowCount).toBe(4);
    expect(accounts.rows).toEqual([{ balance: "24680.42000000" }]);
  });

  it("creates one starter portfolio when first-time profile requests overlap", async () => {
    const [firstResponse, secondResponse] = await Promise.all([
      fetch(`${baseUrl}/api/profile`, {
        headers: { cookie: "__session=database-overlap" },
      }),
      fetch(`${baseUrl}/api/profile`, {
        headers: { cookie: "__session=database-overlap" },
      }),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);

    const expectedProfile = {
      name: "Alex Morgan",
      email: "overlap-database-test@example.invalid",
      verificationStatus: "verified",
    };
    expect(await firstResponse.json()).toMatchObject(expectedProfile);
    expect(await secondResponse.json()).toMatchObject(expectedProfile);

    const [profiles, holdings, activities, accounts] = await Promise.all([
      pool.query(
        "select display_name, email from wallet_profiles where clerk_user_id = $1",
        [overlapClerkUserId],
      ),
      pool.query(
        "select symbol from wallet_holdings where clerk_user_id = $1 order by symbol",
        [overlapClerkUserId],
      ),
      pool.query(
        "select type from wallet_activities where clerk_user_id = $1",
        [overlapClerkUserId],
      ),
      pool.query(
        "select balance from trading_accounts where clerk_user_id = $1",
        [overlapClerkUserId],
      ),
    ]);

    expect(profiles.rows).toEqual([
      {
        display_name: "Alex Morgan",
        email: "overlap-database-test@example.invalid",
      },
    ]);
    expect(holdings.rows.map(({ symbol }) => symbol)).toEqual([
      "BNB",
      "BTC",
      "ETH",
      "USDC",
      "USDT",
    ]);
    expect(activities.rowCount).toBe(4);
    expect(accounts.rows).toEqual([{ balance: "24680.42000000" }]);
  });

  it("settles a winning trade into the balance shared by Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);

    const placementResponse = await fetch(`${baseUrl}/api/trading/trades`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        asset: "BTC",
        direction: "long",
        amount: 100,
        timeframeSecs: 60,
      }),
    });
    expect(placementResponse.status).toBe(200);

    await pool.query(
      `update trades
       set expires_at = now() - interval '1 second', admin_override = 'win'
       where clerk_user_id = $1 and status = 'active'`,
      [newClerkUserId],
    );

    const tradesResponse = await fetch(`${baseUrl}/api/trading/trades`, { headers });
    expect(tradesResponse.status).toBe(200);
    expect(await tradesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "completed", result: "win", payout: 85 }),
      ]),
    );

    const [accountResponse, portfolioResponse] = await Promise.all([
      fetch(`${baseUrl}/api/trading/account`, { headers }),
      fetch(`${baseUrl}/api/portfolio`, { headers }),
    ]);
    expect(accountResponse.status).toBe(200);
    expect(portfolioResponse.status).toBe(200);

    const account = await accountResponse.json() as { balance: number };
    const portfolio = await portfolioResponse.json() as { totalValue: number };
    expect(account.balance).toBe(24765.42);
    expect(portfolio.totalValue).toBe(24765.42);
  });

  it("settles a losing trade into the balance shared by Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);

    const placementResponse = await fetch(`${baseUrl}/api/trading/trades`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        asset: "BTC",
        direction: "short",
        amount: 100,
        timeframeSecs: 60,
      }),
    });
    expect(placementResponse.status).toBe(200);

    await pool.query(
      `update trades
       set expires_at = now() - interval '1 second', admin_override = 'loss'
       where clerk_user_id = $1 and status = 'active'`,
      [newClerkUserId],
    );

    const tradesResponse = await fetch(`${baseUrl}/api/trading/trades`, { headers });
    expect(tradesResponse.status).toBe(200);
    expect(await tradesResponse.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "completed", result: "loss", payout: -100 }),
      ]),
    );

    const [accountResponse, portfolioResponse] = await Promise.all([
      fetch(`${baseUrl}/api/trading/account`, { headers }),
      fetch(`${baseUrl}/api/portfolio`, { headers }),
    ]);
    const account = await accountResponse.json() as { balance: number };
    const portfolio = await portfolioResponse.json() as { totalValue: number };
    expect(account.balance).toBe(24580.42);
    expect(portfolio.totalValue).toBe(24580.42);
  });
});