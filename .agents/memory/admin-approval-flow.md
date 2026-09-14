---
name: Admin approval flow
description: How deposit/withdrawal approval works — admin must approve before balance updates.
---

## Rule
Deposits and withdrawals do NOT touch `wallet_holdings` or the canonical trading balance until an admin approves them via the admin panel. Approval is valid only while the transaction is pending and credits exactly once.

## How it works
- `POST /api/transactions/deposit` inserts a `wallet_transactions` row with `status = pending` and a matching `wallet_activities` row linked via `transactionId`.
- `PATCH /api/admin/transactions/:id/approve` locks the pending transaction and the user's canonical balance, then atomically marks it completed, updates activity and holdings, and credits the trading account.
- Repeated approval returns a conflict and cannot add funds again.
- `PATCH /api/admin/transactions/:id/reject` sets status → `failed`, marks activity `failed`. No holdings change.
- Withdrawals on approval: deduct from holdings.

## Admin panel
- Lives at `/admin-panel/` (artifact slug: `admin-panel`).
- Auth: `X-Admin-Key` header from `sessionStorage`. Secret is `ADMIN_SECRET` Replit Secret.
- All admin routes in `artifacts/api-server/src/routes/blockchain.ts` — guarded by `requireAdmin` middleware that checks `process.env.ADMIN_SECRET`.
- Admin API prefix: `GET/PATCH /api/admin/*`.

**Why:** Deposits must be admin-verified before appearing in user balance, and retries or simultaneous admin actions must never duplicate a credit.
