---
name: KYC flow
description: Full KYC submission, gating, and admin review pipeline — schema, API, frontend, and admin panel.
---

## Key decisions

- **New real users start unverified** — seeded accounts keep the Alex Morgan sample profile/settings data but use `verificationStatus: "unverified"`; only the demo user starts verified.
- **Enum values** — `ProfileVerificationStatus` is `unverified | pending | verified | rejected`. `rejected` was added to the OpenAPI spec and must stay there; omitting it breaks TypeScript comparisons.
- **KYC form fields** — `fullName`, `country`, `city`, `occupation`, `documentType`, `documentImageBase64`. SSN is not collected in the user flow; the legacy admin-visible column is stored as an empty value.
- **Document evidence** — Keep the legacy single-image storage contract; compose the two required ID sides before submission rather than changing the database schema.
- **Upload contract** — Source files may be JFIF/JPG/JPEG/PNG/WebP; the browser normalizes both sides to one JPEG. The encoded API field has a finite 10 MB maximum under the 12 MB JSON parser limit.
- **Route KYC gate** — authenticated protected pages are not mounted until the profile query confirms `verified`; unverified/pending/rejected users see the KYC status screen. Only Settings remains accessible for submission and account support.
- **Server KYC gate** — portfolio, activity, mining, trading, and transaction APIs deny unverified/pending/rejected users. Profile, KYC, referral, security, SMS, and support routes remain available. Admin approval is the only normal path to member access.
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

**Why:** Gate protected components before they mount so their data hooks cannot produce intermittent 401/403 crash screens while profile verification is loading.
