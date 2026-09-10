---
name: Disposable PostgreSQL
description: Environment constraint for temporary PostgreSQL clusters used by validation.
---

Temporary PostgreSQL clusters must configure their Unix socket directory inside the temporary data directory rather than relying on the system default.

**Why:** This Replit environment provides PostgreSQL tooling but does not provide the default `/run/postgresql` socket directory, so otherwise healthy local clusters fail during startup.

**How to apply:** Any validation or test harness that starts PostgreSQL locally should pass an explicit writable socket directory and remove it with the rest of the temporary cluster.