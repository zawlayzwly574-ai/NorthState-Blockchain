---
name: Clerk connector credential isolation
description: Distinguishing an external Clerk integration connection from the app's Clerk Secrets.
---

The Replit Clerk integration authenticates with its own API key. It is independent of the app's Clerk Secrets. An integration can be attached but return `clerk_key_invalid` while the app's own Clerk API requests still succeed.

**Why:** Updating the app's Secrets does not repair an invalid integration credential. Assuming the two are shared risks changing working login configuration without fixing the integration.

**How to apply:** Validate the integration and the app's authentication separately before changing production keys. Never swap app keys or republish solely because the integration reports that it is attached.