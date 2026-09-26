import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawPoolMax = process.env.PG_POOL_MAX ?? "5";
const poolMax = Number(rawPoolMax);
if (!Number.isInteger(poolMax) || poolMax < 1 || poolMax > 100) {
  throw new Error("PG_POOL_MAX must be an integer between 1 and 100.");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: poolMax,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});
export const db = drizzle(pool, { schema });

export * from "./schema";
