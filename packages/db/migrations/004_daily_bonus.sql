-- Daily coin bonus: the only faucet in the economy.
-- Betting moves coins between players and the shop burns them, so without this
-- a guest who wagers away their starting 100 can never bet or buy again.

ALTER TABLE guest_users
ADD COLUMN IF NOT EXISTS last_bonus_at TIMESTAMPTZ;

-- Claims are audited like every other coin movement.
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_transaction_type_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_transaction_type_check
  CHECK (transaction_type IN ('bet_placed', 'bet_won', 'bet_lost', 'initial_allocation', 'admin_adjustment', 'daily_bonus'));
