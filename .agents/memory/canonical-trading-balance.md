---
name: Canonical trading balance
description: Shared balance source and atomic settlement rules for Overview and Trading.
---

Overview Total Balance and Trading Balance must use the same portfolio query value and render it in USD. New and missing accounts start at exactly zero; no sample holdings, activity, or fallback may imply spendable funds. The Overview currency selector applies only to cash and holding details, never the canonical Total Balance. Placing a trade leaves that balance unchanged while active trade amounts are treated as reservations. At settlement, a loss subtracts the trade amount and a win adds only `amount × payoutRate`.

**Why:** Separate queries, refresh timing, or currency conversion can make two views appear different even when the database column matches. Deducting stakes at placement also obscured whether losses were applied when the result settled.

**How to apply:** Use the portfolio query as the display source on both pages and format both canonical balances as USD. Only an atomic admin-approved deposit or an explicitly defined settlement/adjustment may add funds. Serialize placement, approval, admin adjustment, and settlement with the same per-user lock. Preserve legitimate existing balances. If an authenticated portfolio read fails because the database is unavailable, return a validated zero-balance portfolio; never invent funds, authorize writes, or bypass account restrictions.