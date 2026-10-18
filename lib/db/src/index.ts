import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let pool: any;
let db: any;

if (process.env.DATABASE_URL) {
  try {
    const rawPoolMax = process.env.PG_POOL_MAX ?? "5";
    const poolMax = Number(rawPoolMax);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.isInteger(poolMax) && poolMax >= 1 ? poolMax : 5,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
    });
    db = drizzle(pool, { schema });
  } catch {
    console.warn("[AI Studio] Database connection error — using mock");
  }
}

if (!db) {
  console.warn("[AI Studio] Database not connected — using mock");
  const noOp = {
    findMany: async () => [],
    findFirst: async () => null,
    findUnique: async () => null,
    create: async (d: any) => d?.data ?? {},
    update: async (d: any) => d?.data ?? {},
    delete: async () => ({}),
  };
  db = new Proxy({}, {
    get: (_, prop) =>
      prop === "query" ? new Proxy({}, { get: () => noOp }) : async () => [],
  });
  pool = {
    query: async () => ({ rows: [] }),
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
    end: async () => {},
  };
}

export { pool, db };
export * from "./schema";

