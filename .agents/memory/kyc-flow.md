---
name: KYC flow
description: Full KYC submission, gating, and admin review pipeline — schema, API, frontend, and admin panel.
---

## Key decisions

- **New real users start unverified** — seeded accounts keep the Alex Morgan sample profile/settings data but use `verificationStatus: "unverified"`; only the demo user starts verified.
- **Enum values** — `ProfileVerificationStatus` is `unverified | pending | verified | rejected`. `rejected` was added to the OpenAPI spec and must stay there; omitting it breaks TypeScript comparisons.
- **KYC form fields** — `fullName`, `country`, `city`, `occupation`, `documentType`, `documentImageBase64`. SSN is not collected in the user flow; the legacy admin-visible column is stored as an empty value.
- **Document evidence** — Keep the legacy single-image storage contract; compose the two required ID sides before submission rather than changing the database schema.
- **Upload contract** — Client accepts any `image/*` file (including HEIC/HEIF from iPhones, converted client-side via `heic2any` before canvas processing) and normalizes both sides into one composed image. Server cross-checks the declared `data:image/...` MIME against the actual magic bytes (JPEG/PNG/WEBP/GIF) and rejects only on mismatch. The encoded API field and JSON body parser use a finite 100 MB limit (raised from 50 MB).
- **Submission response** — authenticated cookie-session submissions return `success: true`, `status: pending`, and `submittedAt` after the atomic insert/profile update.
- **Route KYC gate** — authenticated unverified/pending/rejected users may open Overview, Activity, and Settings without mounting a crash state. Markets, mining, and trading still require `verified`.
- **Server KYC gate** — profile/user, portfolio, activity, notifications, KYC, referral, security, SMS, and support reads remain available to authenticated users. Financial mutations, mining, and trading require Admin-approved KYC.
- **Admin KYC panel** — expandable card per submission; SSN shown blurred with reveal toggle; image shown inline if base64 starts with `data:image`; approve/reject buttons in both row header and expanded footer.
- **Admin population** — Admin user listing reconciles Clerk accounts into missing local profiles idempotently, then reads local users; Clerk outages fall back to already-known profiles.

## Where it lives

- DB schema: `lib/db/src/schema/blockchain.ts` — `kycSubmissionsTable`
- OpenAPI: `lib/api-spec/openapi.yaml` — `KycInput`, `AdminKyc`, `Profile.verificationStatus`
- API routes: `artifacts/api-server/src/routes/blockchain.ts` — `submitKyc`, `enrichKyc`, `ensureSeededUser`
- Frontend: `artifacts/blockchain-hub/src/App.tsx` — `KycStatusScreen`, `Shell` gate, `Settings` verification tab
- Admin panel: `artifacts/admin-panel/src/pages/kyc.tsx` and `artifacts/admin-panel/src/lib/api.ts` — `KycSubmission` interface

**Why:** After adding new fields, always run `pnpm --filter @workspace/db run push` then `pnpm --filter @workspace/api-spec run codegen` — the Zod schemas and React Query hooks are generated from openapi.yaml.

**Why:** Browser-optimize both document sides and keep the composed payload below the server's finite safety limit. This accepts large source photos without allowing unbounded request bodies.

**Why:** Read-only member views and KYC submission must remain usable before verification; only balance-changing or restricted financial features should be blocked.
