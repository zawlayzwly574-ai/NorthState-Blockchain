---
name: Spot and Futures allocation
description: Why Overview totals both balance buckets while existing trading remains Spot-funded.
---

Overview Total Balance includes Spot and Futures funds; the existing Trading Balance remains Spot-only. Transferring between them must conserve the combined total and cannot move Spot funds reserved for active trades. Placing a Spot trade leaves Spot balance unchanged while its stake is reserved; settlement debits a loss or credits only the winnings.

**Why:** The user wanted a balance conversion option under Overview without changing the Futures popup or existing trade execution. An earlier allocation attempt treated the Futures amount as a subset of one combined balance, and left a funded allocation in the database. Treating that historical value as an additional bucket without a one-time conversion would double-count money.

**How to apply:** When migrating an older allocated account, preserve its pre-migration combined total exactly once before new code sums Spot and Futures. Serialize transfers with existing per-user/row trade locks and honor active Spot reservations. The Overview currency selector applies only to cash and holding details, not the USDT-denominated Total Balance.

Admin Panel's user list/detail total must also include both buckets, never a sum of holding rows. Holdings are a secondary per-asset breakdown that may drift from account funds.

Leftover stale seed data (e.g. old hardcoded demo `wallet_holdings` rows) tends to live only in production, not the dev database — check `environment: "production"` with a read-only query before assuming a data-cleanup request applies to dev. The agent's production DB access is read-only, so a data cleanup (not a schema change) must ship as a protected admin endpoint/button the deployed app runs against its own production DB, not a script the agent runs directly.