import express, { type Express } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
if (process.env.NODE_ENV === "production" && !process.env.ADMIN_SECRET) {
  throw new Error("ADMIN_SECRET is required in the production runtime.");
}
const configuredCorsOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function firstHeaderValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.split(",")[0]?.trim();
}

function requestOrigin(req: express.Request) {
  const host = firstHeaderValue(req.headers["x-forwarded-host"]) ?? req.headers.host;
  const protocol = firstHeaderValue(req.headers["x-forwarded-proto"]) ?? req.protocol;
  return host && protocol ? `${protocol}://${host}` : undefined;
}

function enforceAllowedBrowserOrigins(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction,
) {
  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }

  if (origin !== requestOrigin(req) && !configuredCorsOrigins.has(origin)) {
    res.status(403).json({ error: "Origin is not allowed." });
    return;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Key");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Vary", "Origin");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be mounted before body parsers — it streams raw bytes
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(enforceAllowedBrowserOrigins);
// Source KYC photos are accepted regardless of their original file size and
// normalized in the browser before this backward-compatible JSON upload.
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// Resolve publishable key from the incoming host so the same server can
// serve multiple Clerk custom domains / .replit.app deployments.
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
