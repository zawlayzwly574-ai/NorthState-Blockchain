import { Router, type IRouter, type Request, type Response } from "express";
import { pool } from "@workspace/db";

const router: IRouter = Router();

const sendLiveness = (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
};

router.head("/health", sendLiveness);
router.get("/health", sendLiveness);

router.get("/healthz", async (_req, res) => {
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
  } catch {
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

export default router;
