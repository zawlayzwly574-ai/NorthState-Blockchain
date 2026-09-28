import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, getUserList, select, rejectWrite } = vi.hoisted(() => ({
  getUser: vi.fn(),
  getUserList: vi.fn(),
  select: vi.fn(),
  rejectWrite: vi.fn(() => { throw new Error("Admin read attempted a database write"); }),
}));

vi.mock("@clerk/express", () => ({
  clerkClient: { users: { getUser, getUserList } },
  clerkMiddleware: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: null }),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      ...actual.db,
      select,
      insert: rejectWrite,
      update: rejectWrite,
      transaction: rejectWrite,
    },
  };
});

vi.mock("./middlewares/clerkProxyMiddleware", () => ({
  CLERK_PROXY_PATH: "/api/__clerk",
  clerkProxyMiddleware: () => (_request: unknown, _response: unknown, next: () => void) => next(),
  getClerkProxyHost: () => undefined,
}));

import app from "./app";
import {
  holdingsTable,
  kycSubmissionsTable,
  tradingAccountsTable,
  transactionsTable,
  walletProfilesTable,
} from "@workspace/db";

const profiles = Array.from({ length: 17 }, (_, index) => ({
  id: index + 1,
  clerkUserId: `user_${index + 1}`,
  displayName: `Saved member ${index + 1}`,
  email: `saved${index + 1}@example.invalid`,
  verificationStatus: "verified",
  referralCode: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
}));

const accounts = profiles.map((profile) => ({
  clerkUserId: profile.clerkUserId,
  balance: "100",
  futuresBalance: "25",
  tradeOutcomeMode: "auto",
}));

describe("admin user directory with missing Clerk accounts", () => {
  let server: ReturnType<typeof app.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv("ADMIN_SECRET", "test-admin-key");
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
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    rejectWrite.mockClear();
    getUserList.mockReset();
    getUserList.mockResolvedValue({ data: [], totalCount: 0 });
    getUser.mockReset();
    getUser.mockImplementation(async (userId: string) => {
      if (Number(userId.split("_")[1]) > 9) {
        throw Object.assign(new Error("Clerk user not found"), { status: 404 });
      }
      return {
        firstName: "Clerk",
        lastName: "Member",
        emailAddresses: [{ emailAddress: "clerk@example.invalid" }],
        privateMetadata: {},
      };
    });

    select.mockReset();
    select.mockImplementation(() => ({
      from: (table: unknown) => {
        if (table === walletProfilesTable) {
          return {
            orderBy: async () => profiles,
            where: () => ({ limit: async () => [profiles[9]] }),
          };
        }
        if (table === tradingAccountsTable) {
          return {
            where: () => Object.assign(Promise.resolve(accounts), {
              limit: async () => [accounts[9]],
            }),
          };
        }
        if (table === holdingsTable) return { where: async () => [] };
        if (table === transactionsTable || table === kycSubmissionsTable) {
          return { where: () => ({ orderBy: () => ({ limit: async () => [] }) }) };
        }
        throw new Error("Unexpected database table in admin read");
      },
    }));
  });

  it("lists all 17 saved profiles, retaining balances and marking the 8 missing identities", async () => {
    const response = await fetch(`${baseUrl}/api/admin/users`, {
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    expect(response.status).toBe(200);
    const users = await response.json() as Array<{
      clerkUserId: string;
      accountStatus: string;
      displayName: string;
      email: string;
      totalHoldings: number;
    }>;
    expect(users).toHaveLength(17);
    expect(users.filter((user) => user.accountStatus === "deleted")).toHaveLength(8);
    expect(users.find((user) => user.clerkUserId === "user_10")).toMatchObject({
      displayName: "Saved member 10",
      email: "saved10@example.invalid",
      totalHoldings: 125,
    });
    expect(rejectWrite).not.toHaveBeenCalled();
  });

  it("opens the stored details of a profile missing from this Clerk instance", async () => {
    const response = await fetch(`${baseUrl}/api/admin/users/user_10`, {
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      clerkUserId: "user_10",
      displayName: "Saved member 10",
      email: "saved10@example.invalid",
      totalHoldings: 125,
      holdings: [],
      transactions: [],
    });
    expect(rejectWrite).not.toHaveBeenCalled();
  });

  it("does not treat a non-404 Clerk error as a missing identity", async () => {
    getUser.mockRejectedValueOnce(Object.assign(new Error("Clerk unavailable"), { status: 503 }));
    const response = await fetch(`${baseUrl}/api/admin/users/user_10`, {
      headers: { "X-Admin-Key": "test-admin-key" },
    });
    expect(response.status).toBe(503);
    expect(rejectWrite).not.toHaveBeenCalled();
  });
});