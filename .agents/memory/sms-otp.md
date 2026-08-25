---
name: SMS OTP verification
description: Twilio-backed phone verification in Security settings — architecture, codegen flow, and trial-account caveat.
---

## Architecture

- **DB columns**: `sms_phone_number text`, `sms_phone_verified boolean default false` on `walletProfilesTable` (`lib/db/src/schema/blockchain.ts`). Migration applied via `pnpm --filter @workspace/db push`.
- **OTP store**: module-scope `Map<phoneNumber, {code, expires, userId}>` in `artifacts/api-server/src/routes/blockchain.ts`, same pattern as TOTP pending store. Cleaned by `setInterval` every 2 min.
- **Routes**: `POST /api/sms/send-otp` and `POST /api/sms/verify-otp`. Dynamic `await import("twilio")` inside the route (not top-level) to avoid startup errors if secrets are missing.
- **Profile response**: `smsPhoneNumber` and `smsPhoneVerified` now returned from `GET /api/profile`.
- **OpenAPI**: SMS endpoints + schemas added to `lib/api-spec/openapi.yaml`; Profile schema extended.
- **Codegen**: `pnpm --filter @workspace/api-spec codegen` regenerates both `lib/api-zod` and `lib/api-client-react` from openapi.yaml.
- **Frontend**: `SmsOtpBoxes` component (individual digit inputs with auto-advance, backspace, paste, arrow keys) + SecurityRow #6 in `SecurityTab` (`artifacts/blockchain-hub/src/App.tsx`). Uses `useSendSmsOtp` / `useVerifySmsOtp` hooks. 60-second resend countdown.

## Secrets required
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` (E.164 format). Server returns 503 if any are missing.

## Twilio trial account caveat
Trial accounts can only send to verified recipient numbers. The code and routing are correct — upgrade the Twilio account to send to arbitrary numbers.

**Why dynamic import:** Twilio SDK is large; importing at route level avoids bundling issues and lets the server start cleanly even without credentials set.
