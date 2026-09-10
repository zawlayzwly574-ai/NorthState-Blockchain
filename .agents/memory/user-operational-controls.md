---
name: User operational controls
description: Non-database storage and enforcement rules for admin suspend, freeze, and delete actions.
---

Store account operational state (`active`, `suspended`, or `frozen`) in Clerk private metadata rather than overloading KYC status or adding application-database fields. Suspend blocks member API access; freeze blocks portfolio, mining investment, transaction, and trading operations while leaving profile, security, KYC, and support available. Deleting an account removes the Clerk identity but preserves local wallet, transaction, and audit records.

**Why:** Admin account controls must persist without changing the existing database schema or erasing financial history, and they must be enforced server-side rather than represented only as UI labels.

**How to apply:** Keep operational state checks in authenticated member request handling, read status from shared Clerk metadata on every protected request rather than a process-local cache, and never repurpose verification/KYC status for access control.