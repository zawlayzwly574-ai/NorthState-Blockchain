---
name: Verified-email identity reconciliation
description: Safety rules for reconnecting Clerk sessions to an existing financial account when Clerk user IDs change.
---

Use a normalized, primary verified Clerk email to reconnect a changed Clerk user ID to an existing database financial identity. A unique match may be reused without rewriting financial rows. If duplicate email profiles exist, select one only when it is the unique profile with financial history; otherwise retain the current matching identity or fail closed.

**Why:** Google and email sign-in can yield a different Clerk user ID for the same verified person. Creating a new profile loses access to the visible account history, while guessing between ambiguous profiles could expose another account.

**How to apply:** Resolve the canonical financial user ID in authenticated middleware before member routes read or write data. Never reset or transfer holdings, transactions, trades, activities, or balances during reconciliation, and never use an unverified email for matching.