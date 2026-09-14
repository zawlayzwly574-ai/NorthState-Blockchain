---
name: Admin approval flow
description: How deposit/withdrawal approval works — admin must approve before balance updates.
---

## Rule
Deposits and withdrawals do NOT touch `wallet_holdings` until an admin approves them via the admin panel. Only approving a transaction credits/debits holdings.

## How it works
- `POST /api/transactions/deposit` inserts a `wallet_transactions` row with `status = pending` and a matching `wallet_activities` row linked via `transactionId`.
- `PATCH /api/admin/transactions/:id/approve` sets status → `completed`, updates the matching activity row, and upserts/increments `wallet_holdings` for the user.
- `PATCH /api/admin/transactions/:id/reject` sets status → `failed`, marks activity `failed`. No holdings change.
- Withdrawals on approval: deduct from holdings.

## Admin panel
- Lives at `/admin-panel/` (artifact slug: `admin-panel`).
- Auth: `X-Admin-Key` header from browser-persistent local storage. Secret is `ADMIN_SECRET` Replit Secret.
- All admin routes in `artifacts/api-server/src/routes/blockchain.ts` — guarded by `requireAdmin` middleware that checks `process.env.ADMIN_SECRET`.
- Login validates against a database-free admin auth endpoint so database sleep/failure is not misreported as an invalid key.
- Admin API prefix: `GET/PATCH /api/admin/*`.

**Why:** Deposits must be admin-verified before appearing in user balance to prevent fraud.

**Why:** Admin credential validation must remain independent of database queries; operational database failures should not destroy a valid browser login.
