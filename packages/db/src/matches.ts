import { getPool, withTransaction } from './pool.js';

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
  return withTransaction(async (client) => {
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
    return matchId;
  });
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
  await withTransaction(async (client) => {
    await client.query(`UPDATE matches SET status = 'completed', ended_at = now() WHERE id = $1`, [matchId]);
    for (const r of results) {
      await client.query(
        `UPDATE match_players SET final_rank = $3, captures = $4, tokens_home = $5
         WHERE match_id = $1 AND seat = $2`,
        [matchId, r.seat, r.rank, r.captures, r.tokensHome]
      );
      if (r.userId === null) continue;
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
  });
}

export async function abandonMatch(matchId: number): Promise<void> {
  await getPool().query(
    `UPDATE matches SET status = 'abandoned', ended_at = now() WHERE id = $1 AND status = 'active'`,
    [matchId]
  );
}
