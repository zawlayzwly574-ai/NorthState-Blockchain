---
name: Clerk dual-key mismatch causing web 401s
description: How to recognize and fix a Clerk web app where the frontend and backend are wired to two different Clerk applications, causing persistent 401s that look like a normal auth bug.
---

## Symptom
Every authenticated API request from a signed-in web user returns 401, even though:
- The `Authorization: Bearer <token>` header is present and non-empty.
- All expected Clerk cookies (`__client_uat`, `__clerk_db_jwt`, `__session`, etc.) are present.
- Hard refresh, re-login, and the usual cookie/session-loading fixes don't help.

This looks identical to "missing token" or "cookie not sent" bugs, but isn't — the token/cookie are reaching the server just fine.

## Root cause
The frontend (`VITE_CLERK_PUBLISHABLE_KEY`) and backend (`CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`) are configured for **two different Clerk applications**. The browser signs a session against Clerk instance A; the backend's `clerkMiddleware` verifies against Clerk instance B. Verification always fails regardless of header/cookie presence, because the JWKS/signing keys don't match.

## How to detect
Compare the two publishable keys without ever printing their raw values — hash them:
```javascript
// inside a "use impure" function
const crypto = await import("node:crypto");
const hash = s => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);
// compare hash(process.env.CLERK_PUBLISHABLE_KEY) vs hash(process.env.VITE_CLERK_PUBLISHABLE_KEY)
```
If the hashes differ, the keys are different Clerk apps. Confirm the pattern first via server-side request logging (log only header/cookie *presence*, never values) inside the auth-check middleware to rule out a plain missing-token bug before concluding it's a key mismatch.

## Fix
1. First check whether the Clerk tenant is Replit-managed or external via `checkClerkManagementStatus()`. If `status` is not `"external"`, do not hand-edit `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`VITE_CLERK_PUBLISHABLE_KEY` — those are auto-provisioned and must be repaired through the managed flow, not by hand.
2. For an external tenant, the correct fix is getting matching key values (from whichever Clerk app the user's real accounts live in) via `requestSecrets` — never guess or fabricate values, and never bypass/weaken the auth check as a workaround.
3. If the user won't/can't produce matching secret values, an alternative that needs no new secrets: make the frontend build consume the backend's already-present key. In Vite, add a `define` in `vite.config.ts` that overrides `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY` with `JSON.stringify(process.env.CLERK_PUBLISHABLE_KEY)` at build time, then restart the frontend workflow. This makes both sides agree without ever exposing the secret value in chat/logs.
4. Any consequence of switching which Clerk app the frontend targets: existing user sessions (and accounts, if they only existed in the other app) do not carry over — users must sign in/sign up fresh afterward.

**Why:** This is a subtle, high-impact root cause that mimics an ordinary auth wiring bug and wastes significant debugging time (synthetic Backend-API repro attempts, bearer-token workarounds) if not checked early. `setAuthTokenGetter` on web is a red herring some agents reach for — Clerk web auth is cookie-based; adding bearer tokens does not fix a key mismatch and adds a second wrong mechanism on top.
