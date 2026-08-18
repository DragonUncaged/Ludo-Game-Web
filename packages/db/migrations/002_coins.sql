-- Add coin system schema
-- Supports guest-based betting without authentication

-- Add coin balance tracking to guest users
ALTER TABLE guest_users
ADD COLUMN IF NOT EXISTS coin_balance INT NOT NULL DEFAULT 100;

-- Track bet amounts in matches for historical purposes
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS bet_amount INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pool INT DEFAULT 0;

-- Audit trail for coin transactions
CREATE TABLE IF NOT EXISTS coin_transactions (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES guest_users(id) ON DELETE CASCADE,
  match_id        BIGINT REFERENCES matches(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('bet_placed', 'bet_won', 'bet_lost', 'initial_allocation', 'admin_adjustment')),
  amount          INT NOT NULL,
  balance_after   INT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON coin_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_match ON coin_transactions (match_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_created ON coin_transactions (created_at DESC);

-- Denormalized coin account summary (optional, for analytics)
CREATE TABLE IF NOT EXISTS coin_accounts (
  user_id         BIGINT PRIMARY KEY REFERENCES guest_users(id) ON DELETE CASCADE,
  total_earned    INT NOT NULL DEFAULT 0,
  total_spent     INT NOT NULL DEFAULT 0,
  current_balance INT NOT NULL DEFAULT 100,
  matches_played  INT NOT NULL DEFAULT 0,
  matches_won     INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coin_accounts_updated ON coin_accounts (updated_at DESC);
