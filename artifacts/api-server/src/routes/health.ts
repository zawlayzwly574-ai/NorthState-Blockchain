import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
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
  } catch (error: unknown) {
    const databaseError = error && typeof error === "object"
      ? error as { code?: unknown; name?: unknown }
      : null;
    req.log.error({
      databaseErrorCode: typeof databaseError?.code === "string" ? databaseError.code : undefined,
      databaseErrorName: typeof databaseError?.name === "string" ? databaseError.name : undefined,
    }, "Database health check failed");
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

export default router;
