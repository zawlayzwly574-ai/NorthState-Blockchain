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
process.env.ADMIN_SECRET = "test-only-admin-secret";

const { authenticatedUserId, claimsUserId, firstTimeUserId, overlappingUserId, clerkMiddleware, getAuth, getUser } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, {
    userId: string | null;
    sessionClaims?: { sub?: string };
  }>();
  const authenticatedUserId = `database_test_${crypto.randomUUID()}`;
  const claimsUserId = `database_claims_${crypto.randomUUID()}`;
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
    claimsUserId,
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
        userId: request.headers.cookie?.includes("__session=database-claims")
          ? null
          : request.headers.cookie?.includes("__session=database-overlap")
          ? overlappingUserId
          : request.headers.cookie?.includes("__session=database-first-time")
            ? firstTimeUserId
            : request.headers.cookie?.includes("__session=database-restored")
              ? authenticatedUserId
              : null,
        sessionClaims: request.headers.cookie?.includes("__session=database-claims")
          ? { sub: claimsUserId }
          : undefined,
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
  const claimsClerkUserId = claimsUserId;
  const newClerkUserId = firstTimeUserId;
  const overlapClerkUserId = overlappingUserId;
  const referralCode = `DB-AUTH-${randomUUID()}`;
  let server: Server;
  let baseUrl: string;
  let pool: typeof import("@workspace/db").pool;

  beforeAll(async () => {
    ({ pool } = await import("@workspace/db"));
    await removeTestMember();
    await removeMember(claimsClerkUserId);
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
      await removeMember(claimsClerkUserId);
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

  it("serves durable admin users when Clerk lookups are unavailable", async () => {
    getUser.mockRejectedValueOnce(new Error("Clerk unavailable"));
    getUser.mockRejectedValueOnce(new Error("Clerk unavailable"));

    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { "x-admin-key": String(process.env.ADMIN_SECRET) },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        clerkUserId,
        displayName: "Database Test Member",
        email: "database-test@example.invalid",
        accountStatus: "unknown",
      }),
    ]));
  });

  it("creates a zero-balance profile for a first-time authenticated member", async () => {
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

  it("persists deposit and withdrawal requests authenticated through Clerk session claims", async () => {
    const response = await fetch(`${baseUrl}/api/transactions/deposit`, {
      method: "POST",
      headers: {
        cookie: "__session=database-claims",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        asset: "BTC",
        amount: 0.0125,
        txHash: `claims-proof-${randomUUID()}`,
        proofPath: null,
      }),
    });

    expect(response.status).toBe(201);
    const submitted = await response.json() as { id: string; status: string };
    expect(submitted.status).toBe("pending");

    const [transaction, activity] = await Promise.all([
      pool.query(
        "select clerk_user_id, type, asset, amount, status from wallet_transactions where id = $1",
        [Number(submitted.id)],
      ),
      pool.query(
        "select clerk_user_id, type, asset, amount, status from wallet_activities where transaction_id = $1",
        [Number(submitted.id)],
      ),
    ]);
    expect(transaction.rows).toEqual([expect.objectContaining({
      clerk_user_id: claimsClerkUserId,
      type: "deposit",
      asset: "BTC",
      status: "pending",
    })]);
    expect(activity.rows).toEqual([expect.objectContaining({
      clerk_user_id: claimsClerkUserId,
      type: "deposit",
      asset: "BTC",
      status: "pending",
    })]);

    const withdrawalResponse = await fetch(`${baseUrl}/api/transactions/withdraw`, {
      method: "POST",
      headers: {
        cookie: "__session=database-claims",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        asset: "BTC",
        amount: 0.005,
        destination: "bc1qclaimswithdrawaltest",
      }),
    });
    expect(withdrawalResponse.status).toBe(201);
    const withdrawal = await withdrawalResponse.json() as { id: string; status: string };
    expect(withdrawal.status).toBe("pending");
    const persistedWithdrawal = await pool.query(
      "select clerk_user_id, type, asset, status from wallet_transactions where id = $1",
      [Number(withdrawal.id)],
    );
    expect(persistedWithdrawal.rows).toEqual([{
      clerk_user_id: claimsClerkUserId,
      type: "withdrawal",
      asset: "BTC",
      status: "pending",
    }]);
  });

  it("refuses to approve a withdrawal that exceeds the canonical balance", async () => {
    expect((await fetch(`${baseUrl}/api/profile`, {
      headers: { cookie: "__session=database-first-time" },
    })).status).toBe(200);
    await pool.query(
      `insert into wallet_holdings
        (clerk_user_id, symbol, name, amount, value, allocation, change_24h, color)
       values ($1, 'USDT', 'Tether', '10', '10', '100', '0', '#26A17B')`,
      [newClerkUserId],
    );
    await pool.query(
      `insert into trading_accounts (clerk_user_id, balance)
       values ($1, '10')
       on conflict (clerk_user_id) do update set balance = excluded.balance`,
      [newClerkUserId],
    );
    const inserted = await pool.query(
      `insert into wallet_transactions
        (clerk_user_id, type, asset, amount, status, destination)
       values ($1, 'withdrawal', 'USDT', '15', 'pending', 'test-destination')
       returning id`,
      [newClerkUserId],
    );
    const transactionId = inserted.rows[0].id;

    const approval = await fetch(`${baseUrl}/api/admin/transactions/${transactionId}/approve`, {
      method: "PATCH",
      headers: { "x-admin-key": String(process.env.ADMIN_SECRET) },
    });
    expect(approval.status).toBe(409);

    const [transaction, account, holding] = await Promise.all([
      pool.query("select status from wallet_transactions where id = $1", [transactionId]),
      pool.query("select balance from trading_accounts where clerk_user_id = $1", [newClerkUserId]),
      pool.query("select amount from wallet_holdings where clerk_user_id = $1 and symbol = 'USDT'", [newClerkUserId]),
    ]);
    expect(transaction.rows).toEqual([{ status: "pending" }]);
    expect(account.rows).toEqual([{ balance: "10.00000000" }]);
    expect(holding.rows).toEqual([{ amount: "10.000000000000" }]);
  });

  it("creates one zero-balance account when first-time profile requests overlap", async () => {
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
      name: "Overlap Member",
      email: "overlap-database-test@example.invalid",
      verificationStatus: "unverified",
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
        display_name: "Overlap Member",
        email: "overlap-database-test@example.invalid",
      },
    ]);
    expect(holdings.rows).toEqual([]);
    expect(activities.rowCount).toBe(0);
    expect(accounts.rows).toEqual([{ balance: "0.00000000" }]);
  });

  it("credits an approved deposit exactly once", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);

    const inserted = await pool.query(
      `insert into wallet_transactions
        (clerk_user_id, type, asset, amount, status)
       values ($1, 'deposit', 'USDT', '125.00000000', 'pending')
       returning id`,
      [newClerkUserId],
    );
    const transactionId = inserted.rows[0].id;
    await pool.query(
      `insert into wallet_activities
        (clerk_user_id, transaction_id, type, asset, amount, value, status)
       values ($1, $2, 'deposit', 'USDT', '125.00000000', '125.00000000', 'pending')`,
      [newClerkUserId, transactionId],
    );

    const adminHeaders = { "x-admin-key": String(process.env.ADMIN_SECRET) };
    const firstApproval = await fetch(
      `${baseUrl}/api/admin/transactions/${transactionId}/approve`,
      { method: "PATCH", headers: adminHeaders },
    );
    const secondApproval = await fetch(
      `${baseUrl}/api/admin/transactions/${transactionId}/approve`,
      { method: "PATCH", headers: adminHeaders },
    );

    expect(firstApproval.status).toBe(200);
    expect(secondApproval.status).toBe(409);

    const [account, holding, transaction] = await Promise.all([
      pool.query("select balance from trading_accounts where clerk_user_id = $1", [newClerkUserId]),
      pool.query(
        "select amount, value from wallet_holdings where clerk_user_id = $1 and symbol = 'USDT'",
        [newClerkUserId],
      ),
      pool.query("select status from wallet_transactions where id = $1", [transactionId]),
    ]);
    expect(account.rows).toEqual([{ balance: "125.00000000" }]);
    expect(holding.rows).toEqual([{ amount: "125.000000000000", value: "125.00" }]);
    expect(transaction.rows).toEqual([{ status: "completed" }]);
  });

  it("keeps approval and rejection consistent when they race", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    expect((await fetch(`${baseUrl}/api/profile`, { headers })).status).toBe(200);

    const inserted = await pool.query(
      `insert into wallet_transactions
        (clerk_user_id, type, asset, amount, status)
       values ($1, 'deposit', 'USDT', '75.00000000', 'pending')
       returning id`,
      [newClerkUserId],
    );
    const transactionId = inserted.rows[0].id;
    await pool.query(
      `insert into wallet_activities
        (clerk_user_id, transaction_id, type, asset, amount, value, status)
       values ($1, $2, 'deposit', 'USDT', '75.00000000', '75.00000000', 'pending')`,
      [newClerkUserId, transactionId],
    );

    const adminHeaders = { "x-admin-key": String(process.env.ADMIN_SECRET) };
    const [approval, rejection] = await Promise.all([
      fetch(`${baseUrl}/api/admin/transactions/${transactionId}/approve`, {
        method: "PATCH",
        headers: adminHeaders,
      }),
      fetch(`${baseUrl}/api/admin/transactions/${transactionId}/reject`, {
        method: "PATCH",
        headers: adminHeaders,
      }),
    ]);
    expect([approval.status, rejection.status].sort()).toEqual([200, 409]);

    const [transaction, activity, account] = await Promise.all([
      pool.query("select status from wallet_transactions where id = $1", [transactionId]),
      pool.query("select status from wallet_activities where transaction_id = $1", [transactionId]),
      pool.query("select balance from trading_accounts where clerk_user_id = $1", [newClerkUserId]),
    ]);
    expect(activity.rows[0].status).toBe(transaction.rows[0].status);
    if (transaction.rows[0].status === "completed") {
      expect(account.rows).toEqual([{ balance: "75.00000000" }]);
    } else {
      expect(transaction.rows[0].status).toBe("failed");
      expect(account.rows).toEqual([]);
    }
  });

  it("settles a winning trade into the balance shared by Trading and Overview", async () => {
    const headers = {
      cookie: "__session=database-first-time",
      "content-type": "application/json",
    };
    const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers });
    expect(profileResponse.status).toBe(200);
    await pool.query(
      `insert into trading_accounts (clerk_user_id, balance)
       values ($1, '24680.42000000')
       on conflict (clerk_user_id) do update set balance = excluded.balance`,
      [newClerkUserId],
    );

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
    await pool.query(
      `insert into trading_accounts (clerk_user_id, balance)
       values ($1, '24680.42000000')
       on conflict (clerk_user_id) do update set balance = excluded.balance`,
      [newClerkUserId],
    );

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