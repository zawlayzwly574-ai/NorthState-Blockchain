import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(here, "migrations");
const baselineFile = "0000_baseline.sql";
const migrationPriority = new Map([
  [baselineFile, 0],
  ["2026-09-spot-futures-balances.sql", 1],
  ["2026-09-futures-positions.sql", 2],
]);
const preBaselineTables = [
  "wallet_activities",
  "wallet_holdings",
  "kyc_submissions",
  "mining_investments",
  "user_passkeys",
  "support_messages",
  "support_threads",
  "trades",
  "trading_accounts",
  "wallet_transactions",
  "wallet_profiles",
];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set to run database migrations.");
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
  application_name: "northstate-db-migrations",
});

const client = await pool.connect();
let advisoryLockHeld = false;

try {
  await client.query("SELECT pg_advisory_lock(hashtext($1))", ["northstate_schema_migrations"]);
  advisoryLockHeld = true;

  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) =>
      (migrationPriority.get(a) ?? 10) - (migrationPriority.get(b) ?? 10) ||
      a.localeCompare(b),
    );

  if (!files.includes(baselineFile)) {
    throw new Error(`Required baseline migration ${baselineFile} is missing.`);
  }

  for (const filename of files) {
    const contents = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(contents).digest("hex");
    const recorded = await client.query(
      "SELECT checksum FROM public.schema_migrations WHERE filename = $1",
      [filename],
    );

    if (recorded.rowCount) {
      if (recorded.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${filename} was modified. Add a new migration instead.`);
      }
      console.info(`Already applied: ${filename}`);
      continue;
    }

    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL search_path TO public");

      if (filename === baselineFile) {
        const present = await client.query(
          `SELECT count(*)::int AS count
           FROM pg_class
           WHERE relkind IN ('r', 'p')
             AND relnamespace = 'public'::regnamespace
             AND relname = ANY($1::text[])`,
          [preBaselineTables],
        );
        const existingCoreTableCount = present.rows[0].count;

        if (existingCoreTableCount === 0) {
          await client.query(contents);
          console.info(`Applied fresh-database baseline: ${filename}`);
        } else if (existingCoreTableCount === preBaselineTables.length) {
          console.info("Existing core schema found; recording baseline without recreating tables.");
        } else {
          throw new Error(
            `Refusing to apply the baseline to a partial schema (${existingCoreTableCount}/${preBaselineTables.length} core tables exist).`,
          );
        }
      } else {
        await client.query(contents);
        console.info(`Applied: ${filename}`);
      }

      await client.query(
        "INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1, $2)",
        [filename, checksum],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  console.info("Database migrations are current.");
} finally {
  if (advisoryLockHeld) {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", ["northstate_schema_migrations"]);
  }
  client.release();
  await pool.end();
}