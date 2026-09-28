---
name: Published identity verification
description: How to distinguish healthy production connectivity from verified live Clerk identity and the intended Neon database branch.
---

Production secret-name presence and a healthy database check prove only that credentials and a working database connection exist; they do not prove the Clerk instance is live or that the database is the intended Neon production branch. A published frontend's public Clerk key can be classified as test or live without printing the key, but that does not prove the server secret-key type or database target.

**Why:** A successful public deployment was observed embedding a test-class Clerk publishable key despite production secret names being present. Replacing an external Clerk instance without reconciling its user IDs can disconnect existing members from their persisted financial records.

**How to apply:** Classify public client-key type without exposing the key; verify the server identity and Neon project/branch through authorized, non-secret provider/deployment metadata before claiming production is correctly configured. Do not switch Clerk credentials, reset data, or assume a healthy database check identifies the correct branch without a migration and explicit approval.