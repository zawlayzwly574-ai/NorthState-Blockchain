---
name: Canonical trading balance
description: Shared balance source and atomic settlement rules for Overview and Trading.
---

Overview Total Balance and Trading Balance must read the same account balance column. Placing a trade leaves that balance unchanged while active trade amounts are treated as reservations. At settlement, a loss subtracts the trade amount and a win adds only `amount × payoutRate`.

**Why:** Duplicated wallet/trading balances drifted, and deducting stakes at placement obscured whether losses were applied when the result settled.

**How to apply:** Serialize placement, admin adjustment, and settlement with the same per-user lock. Lock the trade and account row during settlement; update the balance, result, payout, and win/loss counters in one transaction. Preserve existing holdings, histories, and profiles.