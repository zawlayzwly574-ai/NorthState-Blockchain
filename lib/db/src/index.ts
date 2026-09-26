import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Marks writers that understand the Spot/Futures allocation. The Neon migration
// rejects older API writers on accounts with funded Futures balances.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  application_name: "northstar-futures-v2",
});
export const db = drizzle(pool, { schema });

export * from "./schema";
