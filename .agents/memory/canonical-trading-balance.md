---
name: Canonical trading balance
description: Shared balance source and atomic settlement rules for Overview and Trading.
---

Overview Total Balance and the Admin balance must reflect the canonical trading account total and render it in USD. The Overview currency selector applies only to cash and holding details, never the canonical Total Balance. Once the Spot/Futures funding schema is enabled, Trading displays the Futures allocation within that total; Spot is the remainder. Transfers move the allocation without changing the total. New Futures trades reserve Futures funds; legacy trades created before the allocation remain Spot-funded. At settlement, a loss subtracts the trade amount and a win adds only `amount × payoutRate` to both the total and the trade's funding source.

**Why:** Members need to fund Futures deliberately without making the same funds spendable as Spot. Existing trades and older published API instances must not accidentally spend or settle a Futures allocation as Spot. Deducting stakes at placement also obscures whether losses were applied when the result settled.

**How to apply:** Overview exposes the total through its portfolio response, while Trading reads the allocation from the same account row. Serialize placement, settlement, transfers, admin adjustments, and transaction approval with per-user/row locks. Debits and withdrawals may consume only available Spot; moving Futures back may not consume active Futures reservations. Only pending deposits or withdrawals may be approved once. The external Neon migration must precede activation, and older published writers must be blocked on funded accounts until the updated API is published.

Admin Panel's user list/detail balance figure must also read this same `trading_accounts.balance` row, never a sum of `wallet_holdings.value`. Holdings rows are a secondary per-asset breakdown that can drift from the canonical balance (e.g. admin credit/debit adjustments only touch the balance, not holdings) or contain stale seed data from old accounts, so summing them produces a wrong, inconsistent-looking total.

Leftover stale seed data (e.g. old hardcoded demo `wallet_holdings` rows) tends to live only in production, not the dev database — check `environment: "production"` with a read-only query before assuming a data-cleanup request applies to dev. The agent's production DB access is read-only, so a data cleanup (not a schema change) must ship as a protected admin endpoint/button the deployed app runs against its own production DB, not a script the agent runs directly.