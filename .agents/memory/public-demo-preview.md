---
name: Public demo preview
description: Safety boundary and fallback behavior for public access to the member interface.
---

Signed-out visitors and visitors with stale Clerk sessions should see a stable, isolated demo of the complete member interface. Demo data must remain frontend-only, while protected financial and administrative mutations remain authenticated.

**Why:** Public preview access is required, but exposing member records or allowing demo interactions to mutate real balances would violate the product's data boundary. Stale sessions must not create account-error or refresh loops.

**How to apply:** Keep public market data live, use clearly labeled sample portfolio and activity data, stop protected polling after authorization errors, and convert demo mutations into preview-only feedback.