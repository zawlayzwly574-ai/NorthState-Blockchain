---
name: Vercel CORS policy
description: User-approved broad Vercel preview-origin allowance and its security tradeoff.
---

The user explicitly asked the API to accept the production custom domain, the admin Vercel domain, and **all HTTPS `*.vercel.app` origins**, rather than only known project slugs or a manually maintained preview allowlist.

**Why:** Vercel preview hostnames vary between deployments and the user wants both member and admin apps to remain usable without updating Railway's origin settings for each preview. This also includes unrelated Vercel projects; CORS is not an authentication boundary.

**How to apply:** Preserve the broad HTTPS-only suffix rule until the user requests a narrower policy. Reflect only the validated incoming origin, set `Vary: Origin`, reject lookalike hosts and HTTP, and continue requiring Clerk bearer tokens or the admin key for protected routes. Do not use `Access-Control-Allow-Origin: *` with credentials.