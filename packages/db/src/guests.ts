import { getPool, withTransaction } from './pool.js';

/** Seeded by migration 003. Every new guest owns these, equipped. */
const DEFAULT_COSMETICS = ['char_default', 'dice_default', 'board_default', 'emote_default'];

export async function upsertGuestUser(deviceToken: string, nickname: string): Promise<number> {
  return withTransaction(async (client) => {
    const existing = await client.query(`SELECT 1 FROM guest_users WHERE device_token = $1`, [deviceToken]);
    const res = await client.query<{ id: string }>(
      `INSERT INTO guest_users (device_token, nickname)
       VALUES ($1, $2)
       ON CONFLICT (device_token)
       DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = now()
       RETURNING id`,
      [deviceToken, nickname]
    );
    const userId = Number(res.rows[0]!.id);

    if (existing.rowCount === 0) {
      for (const cosmeticId of DEFAULT_COSMETICS) {
        await client.query(
          `INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
          [userId, cosmeticId]
        );
      }
    }
    return userId;
  });
}

export async function getStatsByDeviceToken(deviceToken: string) {
  const res = await getPool().query(
    `SELECT u.id, u.nickname, u.created_at, u.coin_balance,
            COALESCE(s.games_played, 0) AS games_played,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.captures_made, 0) AS captures_made,
            COALESCE(s.tokens_finished, 0) AS tokens_finished
     FROM guest_users u
     LEFT JOIN user_stats s ON s.user_id = u.id
     WHERE u.device_token = $1`,
    [deviceToken]
  );
  return res.rows[0] ?? null;
}

export async function getHistoryByDeviceToken(deviceToken: string, limit = 20) {
  const res = await getPool().query(
    `SELECT m.id, m.join_code, m.dice_mode, m.seats, m.status, m.started_at, m.ended_at,
            mp.final_rank, mp.captures, mp.tokens_home, mp.color
     FROM guest_users u
     JOIN match_players mp ON mp.user_id = u.id
     JOIN matches m ON m.id = mp.match_id
     WHERE u.device_token = $1
     ORDER BY m.started_at DESC
     LIMIT $2`,
    [deviceToken, limit]
  );
  return res.rows;
}

export interface LeaderboardEntry {
  id: number;
  nickname: string;
  wins: number;
  gamesPlayed: number;
  coinBalance: number;
  capturesMade: number;
  /** Wearing something bought from the shop (the free defaults don't count). */
  hasEquippedCosmetic: boolean;
}

export async function getLeaderboard(limit = 50): Promise<LeaderboardEntry[]> {
  const res = await getPool().query<{
    id: string;
    nickname: string;
    wins: string;
    games_played: string;
    coin_balance: string;
    captures_made: string;
    has_equipped: boolean;
  }>(
    `SELECT u.id, u.nickname, s.wins, s.games_played, u.coin_balance, s.captures_made,
            EXISTS(
              SELECT 1 FROM player_cosmetics pc
              JOIN cosmetics c ON c.id = pc.cosmetic_id
              WHERE pc.user_id = u.id AND pc.is_equipped AND c.price > 0
            ) AS has_equipped
     FROM guest_users u
     JOIN user_stats s ON s.user_id = u.id
     WHERE s.games_played > 0
     ORDER BY s.wins DESC, s.games_played DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    nickname: row.nickname,
    wins: Number(row.wins),
    gamesPlayed: Number(row.games_played),
    coinBalance: Number(row.coin_balance),
    capturesMade: Number(row.captures_made),
    hasEquippedCosmetic: row.has_equipped,
  }));
}

// Cleanup only ever touches guests who never played: their coin and cosmetic rows
// cascade, and there's no match history to orphan.
const STALE_GUEST_FILTER = `
  u.last_seen_at < now() - make_interval(days => $1)
  AND NOT EXISTS (SELECT 1 FROM match_players mp WHERE mp.user_id = u.id)`;

export interface StaleAccount {
  id: number;
  nickname: string;
  coinBalance: number;
  createdAt: string;
  lastSeenAt: string;
}

export async function getStaleGuestAccounts(inactiveDays: number): Promise<StaleAccount[]> {
  const res = await getPool().query<{
    id: string;
    nickname: string;
    coin_balance: number;
    created_at: string;
    last_seen_at: string;
  }>(
    `SELECT u.id, u.nickname, u.coin_balance, u.created_at, u.last_seen_at
       FROM guest_users u
      WHERE ${STALE_GUEST_FILTER}
      ORDER BY u.created_at`,
    [inactiveDays]
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    nickname: row.nickname,
    coinBalance: Number(row.coin_balance),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}

export async function deleteStaleGuestAccounts(inactiveDays: number): Promise<number> {
  const res = await getPool().query(`DELETE FROM guest_users u WHERE ${STALE_GUEST_FILTER}`, [inactiveDays]);
  return res.rowCount ?? 0;
}
