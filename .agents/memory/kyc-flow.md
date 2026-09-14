---
name: KYC flow
description: Full KYC submission, gating, and admin review pipeline — schema, API, frontend, and admin panel.
---

## Key decisions

- **New real users start unverified** — seeded accounts keep the Alex Morgan sample profile/settings data but use `verificationStatus: "unverified"`; only the demo user starts verified.
- **Enum values** — `ProfileVerificationStatus` is `unverified | pending | verified | rejected`. `rejected` was added to the OpenAPI spec and must stay there; omitting it breaks TypeScript comparisons.
- **KYC form fields** — `fullName`, `country`, `city`, `occupation`, `documentType`, `documentImageBase64`. SSN is not collected in the user flow; the legacy admin-visible column is stored as an empty value.
- **Document evidence** — Keep the legacy single-image storage contract; compose the two required ID sides before submission rather than changing the database schema.
- **Shell KYC gate** — `Shell` checks `profile.verificationStatus` and replaces `{children}` with `<KycStatusScreen>` for any non-`/settings` route when status is not `verified`. This keeps `/settings` accessible so users can submit their KYC.
- **Server KYC gate** — member APIs deny unverified/pending/rejected users except profile, KYC, referral, security, SMS, and support routes. Admin approval is the only normal path to full member access.
- **Admin KYC panel** — expandable card per submission; SSN shown blurred with reveal toggle; image shown inline if base64 starts with `data:image`; approve/reject buttons in both row header and expanded footer.

## Where it lives

- DB schema: `lib/db/src/schema/blockchain.ts` — `kycSubmissionsTable`
- OpenAPI: `lib/api-spec/openapi.yaml` — `KycInput`, `AdminKyc`, `Profile.verificationStatus`
- API routes: `artifacts/api-server/src/routes/blockchain.ts` — `submitKyc`, `enrichKyc`, `ensureSeededUser`
- Frontend: `artifacts/blockchain-hub/src/App.tsx` — `KycStatusScreen`, `Shell` gate, `Settings` verification tab
- Admin panel: `artifacts/admin-panel/src/pages/kyc.tsx` and `artifacts/admin-panel/src/lib/api.ts` — `KycSubmission` interface

**Why:** After adding new fields, always run `pnpm --filter @workspace/db run push` then `pnpm --filter @workspace/api-spec run codegen` — the Zod schemas and React Query hooks are generated from openapi.yaml.

**Why:** Browser-optimize both document sides and keep the composed payload below the server's finite safety limit. This accepts large source photos without allowing unbounded request bodies.
