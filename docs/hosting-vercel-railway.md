# Vercel + Railway hosting

## Service layout

- Deploy `artifacts/blockchain-hub` as a Vercel project (member web app).
- Deploy `artifacts/admin-panel` as a second Vercel project.
- Deploy the `@workspace/api-server` workspace service to Railway.
- Keep Neon as the only application database. Set `DATABASE_URL` on Railway only; do not create a Vercel database or point a frontend bundle at PostgreSQL.

Both Vercel projects use their artifact directory as the project root. The checked-in `vercel.json` files build the corresponding workspace and publish `dist/public`. The Vite builds use `/` when `BASE_PATH` is not set, so Vercel does not need Replit's path prefix or injected `PORT`.

## Environment variables

Set secrets in each platform's environment-variable manager. Do not commit `.env` files or put private values in Vercel's `VITE_*` variables.

### Railway API service

Required:

- `DATABASE_URL` — the existing Neon PostgreSQL connection string for this app.
- `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` — keys for the same external Clerk instance used by the frontend.
- `ADMIN_SECRET` — protects `/api/admin/*`.
- `CORS_ALLOWED_ORIGINS` — comma-separated, exact HTTPS origins for the member and admin Vercel deployments (include custom domains and any preview domains that need access).

Optional:

- `PG_POOL_MAX` — connection limit per Railway process; defaults to `5`. Keep the total across Railway replicas within Neon connection limits.
- `MARKET_API_KEY` — optional CoinGecko key for increased market-data limits.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` — only needed if enabling Twilio-backed phone verification.
- `PORT` is assigned by Railway; do not hard-code it.

The existing Replit project configuration contains a market-data credential inline. Rotate it before deploying, remove the inline value from the Replit configuration, and store the replacement only as Railway's `MARKET_API_KEY` variable.

### Member Vercel project

- `VITE_CLERK_PUBLISHABLE_KEY` — the production (`pk_live_`) publishable key for the Clerk instance used by real members. Do not use a development (`pk_test_`) instance for the production member site.
- `CLERK_PUBLISHABLE_KEY` — optional compatibility setting; if present, it must exactly match `VITE_CLERK_PUBLISHABLE_KEY` and the Railway API key.
- `VITE_API_BASE_URL` — the public HTTPS base URL of the Railway API, with no trailing slash.

### Admin Vercel project

- `VITE_API_BASE_URL` — the same Railway API base URL, with no trailing slash.

The API client sends Clerk bearer tokens for cross-origin member requests. The Railway API must allow the exact Vercel origins through `CORS_ALLOWED_ORIGINS`. Admin requests send `X-Admin-Key`; that secret remains in Railway and is entered by an administrator in the admin panel.

Configure the production Clerk instance to allow email verification-code sign-in if members should sign in with a code from their inbox. Email sign-in verification and application KYC approval are separate. The API restores profile access from the member's latest KYC submission only when that submission is already marked `verified`; pending or rejected submissions stay gated. When a Clerk instance changes, keep the existing database; the API reconnects a profile and its KYC data only when Clerk confirms the email and exactly one legacy profile matches. Multiple matches need manual review.

## Database migration procedure

The API does not run DDL at startup. Migrations are a separate, tracked command:

```sh
pnpm --filter @workspace/db run migrate
```

The migration runner:

- Requires `DATABASE_URL`, takes a PostgreSQL advisory lock, and records checksums in `public.schema_migrations`.
- Creates the Drizzle-generated baseline only on an empty application schema.
- Records the baseline without recreating tables when it finds the complete pre-Futures schema.
- Refuses to proceed on a partial schema or if an applied migration file has changed.
- Applies the two existing balance/Futures migrations in their required order and wraps each in a transaction.

Run it first against a staging clone or a new, empty database. Before running it against the production Neon URL, confirm that URL is the intended database and take a restorable backup. The runner applies schema only; it does not copy balances, profiles, trades, or positions between databases.

For the production cutover, point Railway at the same Neon database that currently holds the member data. If changing to a different Neon database, restore the data separately and compare profile/account/trade/position row counts before switching traffic. Do not use `drizzle-kit push` or `push-force` as the production migration process.

## Deployment checks

1. Set Railway's service root to the repository root so pnpm can resolve the workspace.
2. Configure the Railway variables above, then run the migration command manually against staging.
3. Confirm Railway's `/api/healthz` returns HTTP 200. It checks database connectivity and the core trading schema; a missing database, table, or connection produces HTTP 503.
4. Configure each Vercel project with its artifact root and the required public build variables.
5. Add both deployed Vercel origins to Railway's `CORS_ALLOWED_ORIGINS`, then confirm sign-in, member balances, trade history, Futures positions, and admin requests against the intended Neon database.

After staging has been verified, Railway's pre-deploy command can be set to the migration command if automatic, serialized schema updates are desired. It is intentionally not enabled by default, so a routine app deployment cannot mutate the production schema without an explicit operator decision.