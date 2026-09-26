-- Apply this migration before starting the new API or running drizzle-kit push.
-- Add a separate Futures balance without changing the total funds held.
-- Earlier allocation builds stored Spot + Futures in balance and used
-- futures_balance as a subset. Convert those rows to two separate balances
-- exactly once, identified by the old allocation constraint.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
SET LOCAL application_name = 'northstar-futures-v2';

ALTER TABLE public.trading_accounts
  ADD COLUMN IF NOT EXISTS futures_balance numeric(20, 8) NOT NULL DEFAULT 0;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trading_accounts'::regclass
      AND conname = 'trading_accounts_futures_bounds'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trading_accounts'::regclass
      AND conname = 'trading_accounts_separate_balances_nonnegative'
  ) AND EXISTS (
    SELECT 1 FROM public.trading_accounts WHERE futures_balance > 0
  ) THEN
    RAISE EXCEPTION 'Existing Futures funds have ambiguous balance semantics; reconcile before migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trading_accounts'::regclass
      AND conname = 'trading_accounts_futures_bounds'
  ) THEN
    ALTER TABLE public.trading_accounts
      DROP CONSTRAINT trading_accounts_futures_bounds;
    UPDATE public.trading_accounts
      SET balance = balance - futures_balance, updated_at = now()
      WHERE futures_balance > 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.trading_accounts'::regclass
      AND conname = 'trading_accounts_separate_balances_nonnegative'
  ) THEN
    ALTER TABLE public.trading_accounts
      ADD CONSTRAINT trading_accounts_separate_balances_nonnegative
      CHECK (balance >= 0 AND futures_balance >= 0);
  END IF;
END;
$migration$;

-- The earlier trigger guarded an older API that treated balance as the
-- combined total. The Spot-only balance is now safe for that API to read.
DROP TRIGGER IF EXISTS guard_futures_account_updates ON public.trading_accounts;
DROP TRIGGER IF EXISTS guard_legacy_trade_inserts ON public.trades;
DROP FUNCTION IF EXISTS public.guard_futures_allocation_writes();

COMMIT;