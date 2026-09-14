---
name: Member route access
description: Authentication and KYC presentation rules for member-facing routes.
---

Signed-in members must retain access to Dashboard, wallet actions, Activity, Trading, Mining Place, and Settings even when identity verification is incomplete. Show and manage KYC state in Settings rather than replacing the app shell or page content.

**Why:** A route-level KYC presentation gate replaced the original member interface with a verification screen and made authentication appear stuck.

**How to apply:** Gate protected routes only on Clerk session readiness. Preserve the requested member route across sign-in and sign-up with a same-origin, allowlisted redirect. If Clerk loading does not finish promptly, show recovery actions rather than an indefinite blank screen.