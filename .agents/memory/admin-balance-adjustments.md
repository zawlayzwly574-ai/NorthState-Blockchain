---
name: Admin balance adjustments
description: Safety and settlement rules for direct administrator USDC wallet credits and debits.
---

Direct admin balance adjustments apply only to the user's USDC wallet holding. Parse amounts as exact fixed-point decimals, serialize adjustments with a transaction-scoped lock, and record the holding mutation plus transaction/activity audit records atomically. Debits must preserve USDC reserved by pending Mining Place investments.

**Why:** A money-moving admin control must not round values, overdraw reserved funds, leave partial audit records, or alter authentication, sessions, trading-account balances, or unrelated wallet flows.

**How to apply:** Keep this as a dedicated admin-secret-guarded endpoint. Require an adjustment reason and retain direction plus before/after balances in the audit record. Do not reuse it for other assets or trading balances without a separate explicit design.