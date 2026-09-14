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
process.env.ADMIN_SECRET = "database-test-admin-secret";

const { authenticatedUserId, firstTimeUserId, relinkedUserId, clerkMiddleware, getAuth, getUser } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, { userId: string | null }>();
  const authenticatedUserId = `database_test_${crypto.randomUUID()}`;
  const firstTimeUserId = `database_new_${crypto.randomUUID()}`;
  const relinkedUserId = `database_relinked_${crypto.randomUUID()}`;
  const getUser = vi.fn(async (userId: string) => ({
    privateMetadata: {},
    primaryEmailAddressId: `email_${userId}`,
    emailAddresses: [
      {
        id: `email_${userId}`,
        verification: { status: "verified" },
        emailAddress:
          userId === firstTimeUserId
            ? "first-time-database-test@example.invalid"
            : "database-test@example.invalid",
      },
    ],
    firstName: userId === firstTimeUserId ? "First-time" : "Database",
    lastName: "Member",
  }));

  return {
    authenticatedUserId,
    firstTimeUserId,
    relinkedUserId,
    getUser,
    getAuth: vi.fn((request: object) => authByRequest.get(request) ?? { userId: null }),
    clerkMiddleware: () => (
      request: { headers: { cookie?: string } },
      _response: unknown,
      next: () => void,
    ) => {
      authByRequest.set(request, {
        userId: request.headers.cookie?.includes("__session=database-first-time")
          ? firstTimeUserId
          : request.headers.cookie?.includes("__session=database-relinked")
            ? relinkedUserId
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
  const referralCode = `DB-AUTH-${randomUUID()}`;
  let server: Server;
  let baseUrl: string;
  let pool: typeof import("@workspace/db").pool;

  beforeAll(async () => {
    ({ pool } = await import("@workspace/db"));
    await removeTestMember();
    await removeFirstTimeMember();
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
      await pool.end();
    }
  });

  afterEach(async () => {
    await removeFirstTimeMember();
  });

  async function removeMember(userId: string) {
    await pool.query("delete from trades where clerk_user_id = $1", [userId]);
    await pool.query("delete from wallet_activities where clerk_user_id = $1", [userId]);
    await pool.query("delete from wallet_transactions where clerk_user_id = $1", [userId]);
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

  async function submitAndApproveDeposit(amount: number) {
    const memberHeaders = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const submitted = await fetch(`${baseUrl}/api/transactions/deposit`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify({
        asset: "USDT",
        amount,
        txHash: `database-test-${randomUUID()}`,
      }),
    });
    expect(submitted.status).toBe(201);
    const transaction = await submitted.json() as { id: string };
    const approved = await fetch(`${baseUrl}/api/admin/transactions/${transaction.id}/approve`, {
      method: "PATCH",
      headers: { "x-admin-key": "database-test-admin-secret" },
    });
    expect(approved.status).toBe(200);
    return transaction.id;
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

  it("maps a replacement Clerk session to the existing database account by verified email", async () => {
    await pool.query(
      `insert into trading_accounts (clerk_user_id, balance)
       values ($1, '725.50')
       on conflict (clerk_user_id) do update set balance = excluded.balance`,
      [clerkUserId],
    );

    const profileResponse = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=database-relinked" },
    });
    expect(profileResponse.status).toBe(200);
    expect(await profileResponse.json()).toMatchObject({
      name: "Database Test Member",
      email: "database-test@example.invalid",
    });

    const accountResponse = await fetch(`${baseUrl}/api/trading/account`, {
      headers: { cookie: "__session=database-relinked" },
    });
    expect(accountResponse.status).toBe(200);
    expect((await accountResponse.json() as { balance: number }).balance).toBe(725.5);

    const duplicate = await pool.query(
      "select count(*)::int as count from wallet_profiles where clerk_user_id = $1",
      [relinkedUserId],
    );
    expect(duplicate.rows).toEqual([{ count: 0 }]);
  });

  it("creates a profile with an empty zero-balance portfolio for a first-time authenticated member", async () => {
    const response = await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=database-first-time" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      name: "First-time Member",
      email: "first-time-database-test@example.invalid",
      verificationStatus: "unverified",
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
        display_name: "First-time Member",
        email: "first-time-database-test@example.invalid",
      },
    ]);
    expect(holdings.rows).toEqual([]);
    expect(activities.rowCount).toBe(0);
    expect(accounts.rows).toEqual([{ balance: "0.00000000" }]);
  });

  it("credits an approved deposit exactly once in both Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);

    const submitted = await fetch(`${baseUrl}/api/transactions/deposit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        asset: "USDT",
        amount: 275.25,
        txHash: `database-test-${randomUUID()}`,
      }),
    });
    expect(submitted.status).toBe(201);
    const transaction = await submitted.json() as { id: string };

    const beforeApproval = await fetch(`${baseUrl}/api/portfolio`, { headers });
    expect((await beforeApproval.json() as { totalValue: number }).totalValue).toBe(0);

    const approvalHeaders = { "x-admin-key": "database-test-admin-secret" };
    const approved = await fetch(`${baseUrl}/api/admin/transactions/${transaction.id}/approve`, {
      method: "PATCH",
      headers: approvalHeaders,
    });
    expect(approved.status).toBe(200);

    const duplicateApproval = await fetch(`${baseUrl}/api/admin/transactions/${transaction.id}/approve`, {
      method: "PATCH",
      headers: approvalHeaders,
    });
    expect(duplicateApproval.status).toBe(409);

    const [accountResponse, portfolioResponse] = await Promise.all([
      fetch(`${baseUrl}/api/trading/account`, { headers }),
      fetch(`${baseUrl}/api/portfolio`, { headers }),
    ]);
    const account = await accountResponse.json() as { balance: number };
    const portfolio = await portfolioResponse.json() as { totalValue: number };
    expect(account.balance).toBe(275.25);
    expect(portfolio.totalValue).toBe(275.25);
  });

  it("settles a winning trade into the balance shared by Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);
    await submitAndApproveDeposit(1000);

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
    const activityResponse = await fetch(`${baseUrl}/api/activity`, { headers });
    expect(await activityResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "buy", asset: "BTC", status: "completed", value: 85 }),
    ]));

    const [accountResponse, portfolioResponse] = await Promise.all([
      fetch(`${baseUrl}/api/trading/account`, { headers }),
      fetch(`${baseUrl}/api/portfolio`, { headers }),
    ]);
    expect(accountResponse.status).toBe(200);
    expect(portfolioResponse.status).toBe(200);

    const account = await accountResponse.json() as { balance: number };
    const portfolio = await portfolioResponse.json() as { totalValue: number };
    expect(account.balance).toBe(1085);
    expect(portfolio.totalValue).toBe(1085);
  });

  it("settles a losing trade into the balance shared by Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);
    await submitAndApproveDeposit(1000);

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
    const activityResponse = await fetch(`${baseUrl}/api/activity`, { headers });
    expect(await activityResponse.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "sell", asset: "BTC", status: "completed", value: -100 }),
    ]));

    const [accountResponse, portfolioResponse] = await Promise.all([
      fetch(`${baseUrl}/api/trading/account`, { headers }),
      fetch(`${baseUrl}/api/portfolio`, { headers }),
    ]);
    const account = await accountResponse.json() as { balance: number };
    const portfolio = await portfolioResponse.json() as { totalValue: number };
    expect(account.balance).toBe(900);
    expect(portfolio.totalValue).toBe(900);
  });
});