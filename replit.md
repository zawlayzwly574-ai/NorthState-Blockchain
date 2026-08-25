# North State Blockchain

North State Blockchain is a digital-asset wallet and market dashboard with a separate Northstar Admin review panel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/blockchain-hub run dev` — run the North State Blockchain user app
- `pnpm --filter @workspace/admin-panel run dev` — run the Northstar Admin panel
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Clerk auth is workspace-managed: its server and client keys are provisioned as secrets and must never be hardcoded.
- Optional `CORS_ALLOWED_ORIGINS`: comma-separated origins for intentional cross-origin browser clients; the API otherwise accepts browser requests only from its own origin.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- **User app**: North State Blockchain lets users view market data and wallet activity, move supported assets, and submit identity verification with their personal details and an ID document. SSN is not collected.
- **Admin panel**: Northstar Admin manages verification, transaction approval, and support workflows without changing its existing identity or interface.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
