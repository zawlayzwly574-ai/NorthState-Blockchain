---
name: Canonical trading balance
description: Shared balance source and atomic settlement rules for Overview and Trading.
---

Overview Total Balance and Trading Balance must both reflect the canonical trading account balance and render it in USD. The Overview currency selector applies only to cash and holding details, never the canonical Total Balance. Placing a trade leaves that balance unchanged while active trade amounts are treated as reservations. At settlement, a loss subtracts the trade amount and a win adds only `amount × payoutRate`.

**Why:** Separate queries, refresh timing, or currency conversion can make two views appear different even when the database column matches. Deducting stakes at placement also obscured whether losses were applied when the result settled.

**How to apply:** Overview may expose the balance through its portfolio response, while Trading reads the trading-account response; both must originate from the same account row. Serialize placement, settlement, admin adjustments, and transaction approval with per-user/row locks. Only pending deposits or withdrawals may be approved once.

Admin Panel's user list/detail balance figure must also read this same `trading_accounts.balance` row, never a sum of `wallet_holdings.value`. Holdings rows are a secondary per-asset breakdown that can drift from the canonical balance (e.g. admin credit/debit adjustments only touch the balance, not holdings) or contain stale seed data from old accounts, so summing them produces a wrong, inconsistent-looking total.

Leftover stale seed data (e.g. old hardcoded demo `wallet_holdings` rows) tends to live only in production, not the dev database — check `environment: "production"` with a read-only query before assuming a data-cleanup request applies to dev. The agent's production DB access is read-only, so a data cleanup (not a schema change) must ship as a protected admin endpoint/button the deployed app runs against its own production DB, not a script the agent runs directly.