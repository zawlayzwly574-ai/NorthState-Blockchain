import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get(["/health", "/healthz"], async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.wallet_profiles') AS wallet_profiles,
        to_regclass('public.trading_accounts') AS trading_accounts,
        to_regclass('public.futures_positions') AS futures_positions
    `);
    const schema = result.rows[0];
    if (!schema?.wallet_profiles || !schema?.trading_accounts || !schema?.futures_positions) {
      res.status(503).json({ status: "not_ready", database: "schema_incomplete" });
      return;
    }
    res.json({ status: "ok", database: "ok" });
  } catch (error) {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "unknown";
    logger.error({ errorCode }, "Database health check failed");
    const databaseError =
      errorCode === "28P01" ? "authentication_failed" :
      errorCode === "3D000" ? "database_not_found" :
      errorCode === "ENOTFOUND" ? "host_not_found" :
      ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH"].includes(errorCode)
        ? "connection_failed"
        : "unknown";
    res.status(503).json({ status: "not_ready", database: "unavailable", databaseError });
  }
});

export default router;
