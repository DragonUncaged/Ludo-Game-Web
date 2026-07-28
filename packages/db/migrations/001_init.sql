CREATE TABLE IF NOT EXISTS guest_users (
  id            BIGSERIAL PRIMARY KEY,
  device_token  UUID NOT NULL UNIQUE,
  nickname      TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id          BIGSERIAL PRIMARY KEY,
  room_id     TEXT NOT NULL,
  join_code   TEXT NOT NULL,
  dice_mode   TEXT NOT NULL CHECK (dice_mode IN ('fair', 'dynamic')),
  seats       SMALLINT NOT NULL CHECK (seats BETWEEN 2 AND 4),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  snapshot    JSONB
);
CREATE INDEX IF NOT EXISTS idx_matches_room ON matches (room_id);

CREATE TABLE IF NOT EXISTS match_players (
  match_id    BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  seat        SMALLINT NOT NULL,
  user_id     BIGINT REFERENCES guest_users(id),
  nickname    TEXT NOT NULL,
  color       TEXT NOT NULL,
  is_bot      BOOLEAN NOT NULL DEFAULT false,
  final_rank  SMALLINT,
  captures    SMALLINT NOT NULL DEFAULT 0,
  tokens_home SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, seat)
);

CREATE TABLE IF NOT EXISTS user_stats (
  user_id         BIGINT PRIMARY KEY REFERENCES guest_users(id),
  games_played    INT NOT NULL DEFAULT 0,
  wins            INT NOT NULL DEFAULT 0,
  captures_made   INT NOT NULL DEFAULT 0,
  tokens_finished INT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
