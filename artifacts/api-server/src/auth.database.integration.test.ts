import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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

const { authenticatedUserId, clerkMiddleware, getAuth, getUser } = vi.hoisted(() => {
  const authByRequest = new WeakMap<object, { userId: string | null }>();
  const getUser = vi.fn().mockResolvedValue({ privateMetadata: {} });
  const authenticatedUserId = `database_test_${crypto.randomUUID()}`;

  return {
    authenticatedUserId,
    getUser,
    getAuth: vi.fn((request: object) => authByRequest.get(request) ?? { userId: null }),
    clerkMiddleware: () => (
      request: { headers: { cookie?: string } },
      _response: unknown,
      next: () => void,
    ) => {
      authByRequest.set(request, {
        userId: request.headers.cookie?.includes("__session=database-restored")
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
  const referralCode = `DB-AUTH-${randomUUID()}`;
  let server: Server;
  let baseUrl: string;
  let pool: typeof import("@workspace/db").pool;

  beforeAll(async () => {
    ({ pool } = await import("@workspace/db"));
    await removeTestMember();
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
      await pool.end();
    }
  });

  async function removeTestMember() {
    await pool.query("delete from wallet_activities where clerk_user_id = $1", [clerkUserId]);
    await pool.query("delete from wallet_holdings where clerk_user_id = $1", [clerkUserId]);
    await pool.query("delete from trading_accounts where clerk_user_id = $1", [clerkUserId]);
    await pool.query("delete from wallet_profiles where clerk_user_id = $1", [clerkUserId]);
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
});