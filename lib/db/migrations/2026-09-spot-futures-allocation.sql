-- One-time additive migration for the external Neon database.
-- Apply before starting the new API, then publish the updated API promptly.
-- Existing balances stay in Spot; existing and still-running older API trades
-- remain Spot-funded until they settle. Do not use drizzle-kit push-force here.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.trading_accounts
  ADD COLUMN futures_balance numeric(20, 8) NOT NULL DEFAULT 0;
ALTER TABLE public.trades
  ADD COLUMN balance_source text NOT NULL DEFAULT 'spot';

ALTER TABLE public.trading_accounts
  ADD CONSTRAINT trading_accounts_futures_bounds
  CHECK (futures_balance >= 0 AND balance >= futures_balance);
ALTER TABLE public.trades
  ADD CONSTRAINT trades_balance_source_values
  CHECK (balance_source IN ('spot', 'futures'));

-- Older published API instances do not know how to protect Futures funds.
-- They may continue operating on accounts with no Futures allocation, but
-- cannot mutate funded accounts or create Spot trades against their total.
-- Lock the account on legacy trade inserts so transfers cannot pass an
-- uncommitted legacy reservation while old code is still serving requests.
CREATE FUNCTION public.guard_futures_allocation_writes()
RETURNS trigger LANGUAGE plpgsql AS $guard$
BEGIN
  IF current_setting('application_name', true) = 'northstar-futures-v2' THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'trading_accounts' THEN
    IF OLD.futures_balance > 0 OR NEW.futures_balance > 0 THEN
      RAISE EXCEPTION 'This account needs the updated trading API for balance changes'
        USING ERRCODE = '55000';
    END IF;
  ELSIF TG_TABLE_NAME = 'trades' AND TG_OP = 'INSERT' THEN
    PERFORM 1 FROM public.trading_accounts
      WHERE clerk_user_id = NEW.clerk_user_id FOR UPDATE;
    IF EXISTS (
      SELECT 1 FROM public.trading_accounts
      WHERE clerk_user_id = NEW.clerk_user_id AND futures_balance > 0
    ) THEN
      RAISE EXCEPTION 'This account needs the updated trading API to place trades'
        USING ERRCODE = '55000';
    END IF;
  END IF;
  RETURN NEW;
END;
$guard$;

CREATE TRIGGER guard_futures_account_updates
  BEFORE UPDATE ON public.trading_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_futures_allocation_writes();
CREATE TRIGGER guard_legacy_trade_inserts
  BEFORE INSERT ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.guard_futures_allocation_writes();

COMMIT;