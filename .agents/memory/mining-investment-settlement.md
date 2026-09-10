---
name: Mining investment settlement
description: Durable funding and approval rules for Mining Place investments.
---

Mining Place requests reserve the effective requested or admin-adjusted amount when calculating available USDC. They do not debit wallet holdings while pending. Approval must atomically recheck and debit the USDC holding before activating the position; rejection never changes wallet funds.

**Why:** Logical reservation prevents users from submitting overlapping requests, while final atomic settlement prevents duplicate approvals or concurrent balance overspending without altering the existing transaction ledger.

Gold redemption is a separate ledger operation: consume units from one active position and credit the destination wallet asset at server-owned quotes in one transaction. Keep an immutable conversion record, link the completed wallet transaction, and calculate post-redemption gain/loss from the remaining units' cost basis.

**How to apply:** Keep investment records isolated from ordinary wallet swaps. Any future approval, cancellation, or redemption behavior must preserve the wallet ledger and use guarded, atomic balance updates. Trading may use GOLD as a quoted instrument and display active Mining Place units, but trade reservations and settlement remain against the canonical trading balance; never debit mining investments as though they were cash.