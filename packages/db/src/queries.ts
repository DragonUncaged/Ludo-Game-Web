import { getPool } from './pool.js';

export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Fire-and-forget wrapper — a DB hiccup must never block the game loop. */
export async function safeWrite(label: string, fn: () => Promise<unknown>): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await fn();
  } catch (err) {
    console.error(`[db] ${label} failed`, err);
  }
}

export async function upsertGuestUser(deviceToken: string, nickname: string): Promise<number> {
  const res = await getPool().query<{ id: string }>(
    `INSERT INTO guest_users (device_token, nickname)
     VALUES ($1, $2)
     ON CONFLICT (device_token)
     DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = now()
     RETURNING id`,
    [deviceToken, nickname]
  );
  return Number(res.rows[0]!.id);
}

export interface MatchSeat {
  seat: number;
  userId: number | null;
  nickname: string;
  color: string;
  isBot: boolean;
}

export async function insertMatch(
  info: { roomId: string; joinCode: string; diceMode: string; seats: number },
  players: MatchSeat[]
): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const res = await client.query<{ id: string }>(
      `INSERT INTO matches (room_id, join_code, dice_mode, seats) VALUES ($1, $2, $3, $4) RETURNING id`,
      [info.roomId, info.joinCode, info.diceMode, info.seats]
    );
    const matchId = Number(res.rows[0]!.id);
    for (const p of players) {
      await client.query(
        `INSERT INTO match_players (match_id, seat, user_id, nickname, color, is_bot)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [matchId, p.seat, p.userId, p.nickname, p.color, p.isBot]
      );
    }
    await client.query('COMMIT');
    return matchId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSnapshot(matchId: number, snapshotJson: string): Promise<void> {
  await getPool().query('UPDATE matches SET snapshot = $2::jsonb WHERE id = $1', [matchId, snapshotJson]);
}

export interface SeatResult {
  seat: number;
  userId: number | null;
  rank: number;
  captures: number;
  tokensHome: number;
}

export async function completeMatch(matchId: number, results: SeatResult[]): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE matches SET status = 'completed', ended_at = now() WHERE id = $1`,
      [matchId]
    );
    for (const r of results) {
      await client.query(
        `UPDATE match_players SET final_rank = $3, captures = $4, tokens_home = $5
         WHERE match_id = $1 AND seat = $2`,
        [matchId, r.seat, r.rank, r.captures, r.tokensHome]
      );
      if (r.userId !== null) {
        await client.query(
          `INSERT INTO user_stats (user_id, games_played, wins, captures_made, tokens_finished)
           VALUES ($1, 1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE SET
             games_played = user_stats.games_played + 1,
             wins = user_stats.wins + $2,
             captures_made = user_stats.captures_made + $3,
             tokens_finished = user_stats.tokens_finished + $4,
             updated_at = now()`,
          [r.userId, r.rank === 1 ? 1 : 0, r.captures, r.tokensHome]
        );
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function abandonMatch(matchId: number): Promise<void> {
  await getPool().query(
    `UPDATE matches SET status = 'abandoned', ended_at = now() WHERE id = $1 AND status = 'active'`,
    [matchId]
  );
}

export async function getStatsByDeviceToken(deviceToken: string) {
  const res = await getPool().query(
    `SELECT u.id, u.nickname, u.created_at,
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
