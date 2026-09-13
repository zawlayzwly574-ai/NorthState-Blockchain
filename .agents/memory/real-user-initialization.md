---
name: Real-user initialization
description: Durable product rule separating legitimate new members from the demo account.
---

New Clerk members start unverified with a canonical zero balance, zero referral rewards, and no holdings or activity rows. Sample identity, balances, holdings, activity, verification, and rewards belong only to the explicit demo account.

**Why:** Fabricated funds or history make a legitimate new account appear pre-funded and can leak demo identity into real member views.

**How to apply:** New-member creation may insert missing zero-valued account rows but must never rewrite existing balances, holdings, history, or profile state. Client loading/error fallbacks must also remain zero and empty for authenticated members.