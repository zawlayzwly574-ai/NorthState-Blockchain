---
name: Admin approval flow
description: How deposit/withdrawal approval works — admin must approve before balance updates.
---

## Rule
Deposits and withdrawals do not touch member balances until an admin acts. Approval and rejection must claim only a pending transaction, lock it, and update status, activity, holdings, and the canonical balance in one transaction.

## How it works
- `POST /api/transactions/deposit` inserts a `wallet_transactions` row with `status = pending` and a matching `wallet_activities` row linked via `transactionId`.
- Approval is pending-only, atomic, and idempotent; repeated or competing actions return a conflict and never credit twice.
- Rejection uses the same pending-only transaction claim so it cannot overwrite a completed approval.
- Withdrawals on approval: deduct from holdings.

## Admin panel
- Lives at `/admin-panel/` (artifact slug: `admin-panel`).
- Auth: `X-Admin-Key` header from persistent browser storage. Explicit logout or a real HTTP 401 clears it; dependency and service failures do not.
- Login validates against a key-only endpoint that has no PostgreSQL or Clerk dependency.
- All admin routes in `artifacts/api-server/src/routes/blockchain.ts` — guarded by `requireAdmin` middleware that checks `process.env.ADMIN_SECRET`.
- Admin API prefix: `GET/PATCH /api/admin/*`.

**Why:** Deposits must be verified before appearing in a balance, and concurrent/repeated admin actions must never produce double credit or mismatched status.

**How to apply:** Keep admin decisions inside one database transaction with a row lock and `status = pending` guard. Do not use stats or identity-provider calls to decide whether an admin key is valid.
