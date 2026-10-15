-- Additive, backward-compatible support translation and Web Push schema.
-- Existing account, wallet, transaction, and support-message rows are preserved.
BEGIN;
ALTER TABLE public.support_threads
  ADD COLUMN IF NOT EXISTS target_language text NOT NULL DEFAULT 'my';

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS original_text text,
  ADD COLUMN IF NOT EXISTS translated_text text,
  ADD COLUMN IF NOT EXISTS target_language text;

CREATE TABLE IF NOT EXISTS public.web_push_subscriptions (
  id bigserial PRIMARY KEY,
  owner_type text NOT NULL CHECK (owner_type IN ('admin', 'user')),
  clerk_user_id text,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  disabled_at timestamptz,
  CONSTRAINT web_push_subscriptions_owner_identity_check
    CHECK ((owner_type = 'admin' AND clerk_user_id IS NULL) OR
           (owner_type = 'user' AND clerk_user_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS web_push_subscriptions_owner_idx
  ON public.web_push_subscriptions (owner_type, clerk_user_id)
  WHERE disabled_at IS NULL;
COMMIT;
