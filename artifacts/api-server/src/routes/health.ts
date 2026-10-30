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
      ? error as { code?: unknown; name?: unknown; message?: unknown; severity?: unknown }
      : null;
    const rawMessage = typeof databaseError?.message === "string"
      ? databaseError.message
      : "";
    const message = rawMessage.toLowerCase();
    const databaseFailureKind =
      /password authentication failed|invalid password/.test(message)
        ? "credentials_rejected"
        : /tenant|branch/.test(message)
          ? "neon_tenant_or_branch"
          : /endpoint/.test(message)
            ? "neon_endpoint"
            : /role .* does not exist/.test(message)
              ? "role_missing"
              : /database .* does not exist/.test(message)
                ? "database_missing"
                : /no pg_hba|not allowed to connect|host-based authentication/.test(message)
                  ? "host_not_authorized"
                  : /too many connections/.test(message)
                    ? "connection_limit"
                    : "unclassified";
    // Keep enough diagnostic detail to identify connection/resource failures without logging credentials.
    const safeMessage = rawMessage
      .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[redacted database URL]")
      .replace(/(password\s*[=:]\s*)[^\s,;]+/gi, "$1[redacted]")
      .replace(/(passfile|sslkey|sslcert)=([^\s,;]+)/gi, "$1=[redacted]")
      .slice(0, 300);
    req.log.error({
      databaseErrorCode: typeof databaseError?.code === "string" ? databaseError.code : undefined,
      databaseErrorName: typeof databaseError?.name === "string" ? databaseError.name : undefined,
      databaseErrorSeverity: typeof databaseError?.severity === "string" ? databaseError.severity : undefined,
      databaseFailureKind,
      databaseErrorMessage: safeMessage || undefined,
    }, "Database health check failed");
    res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

export default router;
