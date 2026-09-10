---
name: Canonical trading balance
description: Shared balance source and atomic settlement rules for Overview and Trading.
---

Overview Total Balance and Trading Balance must use the same portfolio query value and render it in USD. The Overview currency selector applies only to cash and holding details, never the canonical Total Balance. Placing a trade leaves that balance unchanged while active trade amounts are treated as reservations. At settlement, a loss subtracts the trade amount and a win adds only `amount × payoutRate`.

**Why:** Separate queries, refresh timing, or currency conversion can make two views appear different even when the database column matches. Deducting stakes at placement also obscured whether losses were applied when the result settled.

**How to apply:** Use the portfolio query as the display source on both pages and format both canonical balances as USD. Serialize placement, admin adjustment, and settlement with the same per-user lock. Preserve existing holdings, histories, and profiles. If an authenticated portfolio read fails because the database is unavailable, return the validated sample portfolio and keep the Overview renderable; never use that fallback to authorize writes or bypass account restrictions.