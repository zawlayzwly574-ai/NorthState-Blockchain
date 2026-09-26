-- Apply before publishing the Futures execution API.
-- Positions reserve margin within futures_balance; opening does not debit
-- the account, and closing changes it by realized PnL only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.futures_positions (
  id serial PRIMARY KEY,
  clerk_user_id text NOT NULL,
  asset text NOT NULL,
  direction text NOT NULL,
  margin numeric(20, 8) NOT NULL,
  leverage integer NOT NULL,
  entry_price numeric(20, 8) NOT NULL,
  close_price numeric(20, 8),
  realized_pnl numeric(20, 8),
  status text NOT NULL DEFAULT 'active',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT futures_positions_margin_positive CHECK (margin > 0),
  CONSTRAINT futures_positions_leverage_range CHECK (leverage BETWEEN 1 AND 100),
  CONSTRAINT futures_positions_direction_valid CHECK (direction IN ('long', 'short')),
  CONSTRAINT futures_positions_status_valid CHECK (status IN ('active', 'closed', 'liquidated'))
);
CREATE INDEX IF NOT EXISTS futures_positions_user_status_idx
  ON public.futures_positions (clerk_user_id, status);
COMMIT;