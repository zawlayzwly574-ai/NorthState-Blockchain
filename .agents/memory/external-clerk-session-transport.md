---
name: External Clerk session transport
description: Production browser session routing for the externally managed Clerk instance.
---

Keep member web authentication cookie-based; do not add bearer-token plumbing to the generated browser API client. Because this project uses an externally managed Clerk instance, route directly to Clerk unless an explicit proxy URL is configured. Never synthesize a production proxy fallback. Continue sending credentials on relative API requests.

**Why:** Forcing the external Clerk instance through the API proxy caused Clerk client and environment requests to return HTTP 400, trapping users on the authentication verification/loading screen.

**How to apply:** Pass through an explicitly configured proxy URL only. Keep direct routing as the default in both development and production, keep Clerk middleware before API routes, and resolve server identity from Clerk's canonical user ID or standard token subject while rejecting conflicts.