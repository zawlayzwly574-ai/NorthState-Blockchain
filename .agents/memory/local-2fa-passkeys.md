---
name: Local 2FA and passkeys
description: How TOTP 2FA and WebAuthn passkeys are implemented without Clerk — DB schema, API routes, and frontend flow.
---

## TOTP (2FA)

- `walletProfilesTable` has `totpSecret TEXT` and `twoFactorEnabled BOOLEAN DEFAULT FALSE`.
- Routes: `POST /api/security/totp/setup` → generates secret + otpauth URI; `POST /api/security/totp/verify` → verifies 6-digit code, enables 2FA; `DELETE /api/security/totp` → disables.
- Challenge store: `totpPending: Map<userId, { secret, expires }>` in-memory with 10-min TTL. Cleanup runs every 120s.
- **otplib v12 does NOT export `authenticator`**. Use: `import { generateSecret, generateURI, verifySync } from 'otplib'`. The `verifySync` call needs `strategy: 'totp'` explicitly.

**Why:** Clerk's `user.createTOTP()` is an API call that may fail in dev or be unavailable. Local implementation is self-contained and survives without Clerk API access.

## Passkeys (WebAuthn)

- New table `user_passkeys`: `id, clerkUserId, credentialId (unique), publicKey, deviceName, transports, counter, createdAt`.
- Routes: `POST /api/security/passkeys/begin` → issues base64url challenge, returns `{challenge, rpId, rpName, userId, userDisplayName, timeout}`; `POST /api/security/passkeys/finish` → stores credential; `GET /api/security/passkeys` → list; `DELETE /api/security/passkeys/:id` → remove.
- Challenge store: `passkeyChallenges: Map<userId, { challenge, expires }>` in-memory with 5-min TTL.
- Client stores the raw attestationObject as `publicKey` — no CBOR decode required for a display-only implementation.

**Frontend WebAuthn flow:**
1. `beginPasskeyMut.mutateAsync({ data: { origin: window.location.origin } })` → get challenge + rpId.
2. Build `PublicKeyCredentialCreationOptions`: challenge and user.id must be `ArrayBuffer` (use `.buffer as ArrayBuffer` from `Uint8Array`).
3. `navigator.credentials.create({ publicKey })` → credential.
4. Send `credentialId` (= `pkCred.id`), `publicKey` (= `bytesToB64url(new Uint8Array(attResp.attestationObject))`), `challenge`, `deviceName`, `transports` to finish endpoint.

**Why:** Clerk's `user.createPasskey()` is an API call that breaks locally. The local WebAuthn implementation is backed by the Drizzle DB and survives without Clerk.

## Orval / OpenAPI notes

- `{ type: object }` with no properties makes orval generate `z.looseObject({})` which doesn't exist in Zod v3. Always define at least one property or use a concrete named schema.
- `PasskeyBeginResult` and `PasskeyFinishInput` avoid this by having explicit typed fields.

## TypeScript notes

- Express route handlers: use `res.status(400).json({...}); return;` (two statements) rather than `return res.status(400).json({...})` which returns `Response` but the handler expects `void` — TypeScript TS7030 fires.
- `req.params.userId` may be `string | string[]` in newer `@types/express`; wrap with `String(req.params.userId)` before passing to `eq()`.
