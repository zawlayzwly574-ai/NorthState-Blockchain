---
name: Admin balance adjustments
description: Safety and settlement rules for direct administrator USDT-denominated canonical balance credits and debits.
---

Direct admin balance adjustments apply to the canonical USDT-denominated account balance shared by Overview and Trading. Parse amounts as exact fixed-point decimals, serialize adjustments with the same transaction-scoped lock used by trade settlement, and record the balance mutation plus transaction/activity audit records atomically. Debits must preserve amounts reserved by active trades.

**Why:** A money-moving admin control must not round values, overdraw available funds, invalidate active trade reservations, leave partial audit records, or alter authentication, sessions, profiles, holdings, or unrelated wallet flows.

**How to apply:** Keep this as a dedicated admin-secret-guarded endpoint. Require an adjustment reason and retain direction plus before/after balances in the audit record. Treat the balance as USDT-denominated; do not mutate wallet holdings.