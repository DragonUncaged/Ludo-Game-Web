-- Daily bonus. Betting only moves coins around and the shop burns them, so
-- without a faucet a player who loses their starting 100 is stuck for good.

ALTER TABLE guest_users
ADD COLUMN IF NOT EXISTS last_bonus_at TIMESTAMPTZ;

-- Claims are audited like every other coin movement.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_transaction_type_check
  CHECK (transaction_type IN ('bet_placed', 'bet_won', 'bet_lost', 'initial_allocation', 'admin_adjustment', 'daily_bonus'));
