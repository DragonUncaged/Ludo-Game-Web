-- Migration: Add cosmetics and shop system tables
-- Adds support for cosmetic items (character, dice, board, emote skins)
-- and player cosmetics ownership/equipment tracking

-- Create cosmetics catalog table
CREATE TABLE IF NOT EXISTS cosmetics (
  id TEXT PRIMARY KEY,
  category VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price INT NOT NULL,
  thumbnail_url VARCHAR(500),
  model_id VARCHAR(255),
  rarity VARCHAR(50) DEFAULT 'common',
  release_date TIMESTAMP DEFAULT NOW(),
  available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_cosmetics_category ON cosmetics(category);
CREATE INDEX idx_cosmetics_available ON cosmetics(available);

-- Create player_cosmetics table (ownership + equipped tracking)
CREATE TABLE IF NOT EXISTS player_cosmetics (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  owned_since TIMESTAMP DEFAULT NOW(),
  is_equipped BOOLEAN DEFAULT FALSE,

  UNIQUE(user_id, cosmetic_id),
  CONSTRAINT fk_player_cosmetics_user
    FOREIGN KEY (user_id) REFERENCES guest_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_player_cosmetics_cosmetic
    FOREIGN KEY (cosmetic_id) REFERENCES cosmetics(id)
);

CREATE INDEX idx_player_cosmetics_user ON player_cosmetics(user_id);
CREATE INDEX idx_player_cosmetics_equipped ON player_cosmetics(user_id, is_equipped);

-- Create cosmetics_transactions table (purchase audit log)
CREATE TABLE IF NOT EXISTS cosmetics_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  cosmetic_id TEXT NOT NULL,
  price INT NOT NULL,
  purchased_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_cosmetics_txn_user
    FOREIGN KEY (user_id) REFERENCES guest_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cosmetics_txn_cosmetic
    FOREIGN KEY (cosmetic_id) REFERENCES cosmetics(id)
);

CREATE INDEX idx_cosmetics_txn_user_date ON cosmetics_transactions(user_id, purchased_at);
CREATE INDEX idx_cosmetics_txn_cosmetic ON cosmetics_transactions(cosmetic_id);

-- Seed initial cosmetics: 4 defaults (free) + 11 premium
INSERT INTO cosmetics (id, category, name, description, price, rarity, available) VALUES
  ('char_default', 'character', 'Default Character', 'Your classic avatar', 0, 'common', true),
  ('char_robot', 'character', 'Robot Avatar', 'A sleek robotic companion', 150, 'rare', true),
  ('char_astronaut', 'character', 'Astronaut', 'Floating through space', 200, 'epic', true),
  ('char_pirate', 'character', 'Pirate Captain', 'Sailing the seven seas', 180, 'rare', true),

  ('dice_default', 'dice', 'Classic Dice', 'The original dice', 0, 'common', true),
  ('dice_gold', 'dice', 'Gold Dice', 'Shimmering with gold', 100, 'uncommon', true),
  ('dice_crystal', 'dice', 'Crystal Dice', 'Transparent and mystical', 120, 'rare', true),
  ('dice_fire', 'dice', 'Fire Dice', 'Blazing hot rolls', 110, 'rare', true),

  ('board_default', 'board', 'Classic Board', 'The original board', 0, 'common', true),
  ('board_neon', 'board', 'Neon Board', 'Glowing neon aesthetic', 150, 'rare', true),
  ('board_wood', 'board', 'Wooden Board', 'Natural wood grain', 120, 'uncommon', true),
  ('board_marble', 'board', 'Marble Board', 'Elegant marble texture', 160, 'rare', true),

  ('emote_default', 'emote', 'Clap', 'Classic applause', 0, 'common', true),
  ('emote_laugh', 'emote', 'Laugh', 'Joyful laughter', 60, 'uncommon', true),
  ('emote_wave', 'emote', 'Wave', 'Friendly wave', 55, 'uncommon', true)
ON CONFLICT (id) DO NOTHING;

-- Auto-grant all free default cosmetics to existing players
INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
SELECT DISTINCT guest_users.id, cosmetics.id, true
FROM guest_users
CROSS JOIN cosmetics
WHERE cosmetics.price = 0
  AND cosmetics.category = 'character'
  AND NOT EXISTS (
    SELECT 1 FROM player_cosmetics
    WHERE player_cosmetics.user_id = guest_users.id
      AND player_cosmetics.cosmetic_id = cosmetics.id
  )
ON CONFLICT (user_id, cosmetic_id) DO NOTHING;

-- Grant all other free defaults (dice, board, emote)
INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
SELECT DISTINCT guest_users.id, cosmetics.id, true
FROM guest_users
CROSS JOIN cosmetics
WHERE cosmetics.price = 0
  AND cosmetics.id IN ('dice_default', 'board_default', 'emote_default')
  AND NOT EXISTS (
    SELECT 1 FROM player_cosmetics
    WHERE player_cosmetics.user_id = guest_users.id
      AND player_cosmetics.cosmetic_id = cosmetics.id
  )
ON CONFLICT (user_id, cosmetic_id) DO NOTHING;
