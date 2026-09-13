---
name: External Clerk session transport
description: Production browser session routing for the externally managed Clerk instance.
---

Keep member web authentication cookie-based; do not add bearer-token plumbing to the generated browser API client. When an explicit production Clerk proxy URL is unavailable, use the API's existing same-origin Clerk proxy path in production. Continue sending credentials on relative API requests.

**Why:** The external Clerk setup authenticated the frontend directly while protected same-origin API requests arrived without a usable Clerk session. The published bundle lacked the API proxy path, and production logs showed repeated authorization failures across all member endpoints.

**How to apply:** Preserve explicit proxy configuration when supplied, fall back to the same-origin proxy only for production browser builds, keep development direct, and keep Clerk middleware before API routes. Resolve server identity from Clerk's canonical user ID or standard token subject and reject conflicts.