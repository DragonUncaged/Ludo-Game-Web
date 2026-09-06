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
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const checkRes = await client.query<{ id: string }>(
      `SELECT id FROM guest_users WHERE device_token = $1`,
      [deviceToken]
    );
    const isNewUser = checkRes.rows.length === 0;

    const res = await client.query<{ id: string }>(
      `INSERT INTO guest_users (device_token, nickname)
       VALUES ($1, $2)
       ON CONFLICT (device_token)
       DO UPDATE SET nickname = EXCLUDED.nickname, last_seen_at = now()
       RETURNING id`,
      [deviceToken, nickname]
    );
    const userId = Number(res.rows[0]!.id);

    // Grant default cosmetics to new players
    if (isNewUser) {
      const defaultCosmetics = ['char_default', 'dice_default', 'board_default', 'emote_default'];
      for (const cosmeticId of defaultCosmetics) {
        await client.query(
          `INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
           VALUES ($1, $2, true)
           ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
          [userId, cosmeticId]
        );
      }
    }

    await client.query('COMMIT');
    return userId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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

// Coin system queries

export async function getCoinBalance(deviceToken: string): Promise<number | null> {
  const res = await getPool().query<{ coin_balance: string }>(
    `SELECT coin_balance FROM guest_users WHERE device_token = $1`,
    [deviceToken]
  );
  return res.rows[0] ? Number(res.rows[0].coin_balance) : null;
}

export interface CoinTransaction {
  id: number;
  userId: number;
  matchId: number | null;
  transactionType: 'bet_placed' | 'bet_won' | 'bet_lost' | 'initial_allocation' | 'admin_adjustment';
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export async function logCoinTransaction(
  userId: number,
  matchId: number | null,
  transactionType: 'bet_placed' | 'bet_won' | 'bet_lost' | 'initial_allocation' | 'admin_adjustment',
  amount: number,
  balanceAfter: number,
  description?: string
): Promise<void> {
  await getPool().query(
    `INSERT INTO coin_transactions (user_id, match_id, transaction_type, amount, balance_after, description)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, matchId, transactionType, amount, balanceAfter, description ?? null]
  );
}

export async function getCoinTransactionHistory(deviceToken: string, limit = 50): Promise<CoinTransaction[]> {
  const res = await getPool().query<{
    id: string;
    user_id: string;
    match_id: string | null;
    transaction_type: string;
    amount: string;
    balance_after: string;
    description: string | null;
    created_at: string;
  }>(
    `SELECT ct.id, ct.user_id, ct.match_id, ct.transaction_type, ct.amount, ct.balance_after, ct.description, ct.created_at
     FROM guest_users u
     JOIN coin_transactions ct ON ct.user_id = u.id
     WHERE u.device_token = $1
     ORDER BY ct.created_at DESC
     LIMIT $2`,
    [deviceToken, limit]
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    matchId: row.match_id ? Number(row.match_id) : null,
    transactionType: row.transaction_type as CoinTransaction['transactionType'],
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    description: row.description,
    createdAt: row.created_at,
  }));
}

export async function updateCoinBalance(userId: number, newBalance: number): Promise<void> {
  await getPool().query(
    `UPDATE guest_users SET coin_balance = $2 WHERE id = $1`,
    [userId, newBalance]
  );
}

export async function awardCoins(
  matchId: number,
  winnerId: number | null,
  winAmount: number,
  loserIds: Array<{ userId: number | null; lossAmount: number }>
): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // Award coins to winner
    if (winnerId !== null && winAmount > 0) {
      const balRes = await client.query<{ coin_balance: string }>(
        `SELECT coin_balance FROM guest_users WHERE id = $1`,
        [winnerId]
      );
      const row = balRes.rows[0];
      if (row) {
        const newBalance = Number(row.coin_balance) + winAmount;
        await client.query(`UPDATE guest_users SET coin_balance = $2 WHERE id = $1`, [winnerId, newBalance]);
        await client.query(
          `INSERT INTO coin_transactions (user_id, match_id, transaction_type, amount, balance_after, description)
           VALUES ($1, $2, 'bet_won', $3, $4, 'Match win')`,
          [winnerId, matchId, winAmount, newBalance]
        );
      }
    }

    // Deduct coins from losers
    for (const { userId, lossAmount } of loserIds) {
      if (userId !== null && lossAmount > 0) {
        const balRes = await client.query<{ coin_balance: string }>(
          `SELECT coin_balance FROM guest_users WHERE id = $1`,
          [userId]
        );
        const row = balRes.rows[0];
        if (row) {
          const newBalance = Math.max(0, Number(row.coin_balance) - lossAmount);
          await client.query(`UPDATE guest_users SET coin_balance = $2 WHERE id = $1`, [userId, newBalance]);
          await client.query(
            `INSERT INTO coin_transactions (user_id, match_id, transaction_type, amount, balance_after, description)
             VALUES ($1, $2, 'bet_lost', $3, $4, 'Match loss')`,
            [userId, matchId, -lossAmount, newBalance]
          );
        }
      }
    }

    // Update match with bet tracking
    await client.query(
      `UPDATE matches SET total_pool = $2 WHERE id = $1`,
      [matchId, loserIds.reduce((sum, l) => sum + l.lossAmount, 0) + winAmount]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Guest account cleanup queries

export interface StaleAccount {
  id: number;
  deviceToken: string;
  nickname: string;
  coinBalance: number;
  createdAt: string;
  lastSeenAt: string;
  matchesPlayed: number;
}

export async function getStaleGuestAccounts(
  inactiveDays = 30,
  includeUnplayedOnly = true
): Promise<StaleAccount[]> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - inactiveDays);

  let query = `
    SELECT
      u.id,
      u.device_token AS "deviceToken",
      u.nickname,
      u.coin_balance AS "coinBalance",
      u.created_at AS "createdAt",
      u.last_seen_at AS "lastSeenAt",
      COUNT(mp.id) AS "matchesPlayed"
    FROM guest_users u
    LEFT JOIN match_players mp ON mp.user_id = u.id
    WHERE u.last_seen_at < $1
  `;

  if (includeUnplayedOnly) {
    query += `
      GROUP BY u.id
      HAVING COUNT(mp.id) = 0
    `;
  } else {
    query += `
      GROUP BY u.id
    `;
  }

  query += ` ORDER BY u.created_at ASC`;

  const res = await getPool().query<{
    id: string;
    deviceToken: string;
    nickname: string;
    coinBalance: string;
    createdAt: string;
    lastSeenAt: string;
    matchesPlayed: string;
  }>(query, [thresholdDate.toISOString()]);

  return res.rows.map(row => ({
    id: Number(row.id),
    deviceToken: row.deviceToken,
    nickname: row.nickname,
    coinBalance: Number(row.coinBalance),
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    matchesPlayed: Number(row.matchesPlayed),
  }));
}

export async function deleteStaleGuestAccounts(
  inactiveDays = 30,
  includeUnplayedOnly = true
): Promise<number> {
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - inactiveDays);

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    let deleteQuery = `
      DELETE FROM guest_users
      WHERE id IN (
        SELECT u.id
        FROM guest_users u
        LEFT JOIN match_players mp ON mp.user_id = u.id
        WHERE u.last_seen_at < $1
    `;

    if (includeUnplayedOnly) {
      deleteQuery += `
        GROUP BY u.id
        HAVING COUNT(mp.id) = 0
      `;
    } else {
      deleteQuery += `
        GROUP BY u.id
      `;
    }

    deleteQuery += ` )`;

    const result = await client.query(deleteQuery, [thresholdDate.toISOString()]);
    const deletedCount = result.rowCount ?? 0;

    await client.query('COMMIT');
    return deletedCount;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Cosmetics system queries

export interface CosmeticItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  thumbnailUrl: string | null;
  rarity: string;
  available: boolean;
}

export async function getShopCosmeticsFiltered(category?: string): Promise<CosmeticItem[]> {
  let query = `SELECT id, category, name, description, price, thumbnail_url AS "thumbnailUrl", rarity, available
               FROM cosmetics WHERE available = true`;
  const params: unknown[] = [];

  if (category) {
    query += ` AND category = $1`;
    params.push(category);
  }

  query += ` ORDER BY category, price ASC`;
  const res = await getPool().query<{
    id: string;
    category: string;
    name: string;
    description: string | null;
    price: string;
    thumbnailUrl: string | null;
    rarity: string;
    available: boolean;
  }>(query, params);

  return res.rows.map(row => ({
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    thumbnailUrl: row.thumbnailUrl,
    rarity: row.rarity,
    available: row.available,
  }));
}

export interface PlayerCosmeticOwned {
  id: string;
  category: string;
  name: string;
  thumbnailUrl: string | null;
  price: number;
  rarity: string;
  isEquipped: boolean;
  ownedSince: string;
}

export async function getPlayerCosmeticsOwned(deviceToken: string): Promise<PlayerCosmeticOwned[]> {
  const res = await getPool().query<{
    id: string;
    category: string;
    name: string;
    thumbnail_url: string | null;
    price: string;
    rarity: string;
    is_equipped: boolean;
    owned_since: string;
  }>(
    `SELECT c.id, c.category, c.name, c.thumbnail_url, c.price, c.rarity, pc.is_equipped, pc.owned_since
     FROM guest_users u
     JOIN player_cosmetics pc ON pc.user_id = u.id
     JOIN cosmetics c ON c.id = pc.cosmetic_id
     WHERE u.device_token = $1
     ORDER BY c.category, c.price ASC`,
    [deviceToken]
  );

  return res.rows.map(row => ({
    id: row.id,
    category: row.category,
    name: row.name,
    thumbnailUrl: row.thumbnail_url,
    price: Number(row.price),
    rarity: row.rarity,
    isEquipped: row.is_equipped,
    ownedSince: row.owned_since,
  }));
}

export interface PlayerEquippedCosmeticsByCategory {
  character: CosmeticItem | null;
  dice: CosmeticItem | null;
  board: CosmeticItem | null;
  emote: CosmeticItem | null;
}

export async function getPlayerCosmeticsEquipped(
  deviceToken: string
): Promise<PlayerEquippedCosmeticsByCategory> {
  const res = await getPool().query<{
    category: string;
    id: string;
    name: string;
    description: string | null;
    price: string;
    thumbnail_url: string | null;
    rarity: string;
    available: boolean;
  }>(
    `SELECT c.id, c.category, c.name, c.description, c.price, c.thumbnail_url, c.rarity, c.available
     FROM guest_users u
     JOIN player_cosmetics pc ON pc.user_id = u.id
     JOIN cosmetics c ON c.id = pc.cosmetic_id
     WHERE u.device_token = $1 AND pc.is_equipped = true`,
    [deviceToken]
  );

  const result: PlayerEquippedCosmeticsByCategory = {
    character: null,
    dice: null,
    board: null,
    emote: null,
  };

  for (const row of res.rows) {
    const cosmetic: CosmeticItem = {
      id: row.id,
      category: row.category,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      thumbnailUrl: row.thumbnail_url,
      rarity: row.rarity,
      available: row.available,
    };
    result[row.category as keyof PlayerEquippedCosmeticsByCategory] = cosmetic;
  }

  return result;
}

export async function getCosmeticById(cosmeticId: string): Promise<CosmeticItem | null> {
  const res = await getPool().query<{
    id: string;
    category: string;
    name: string;
    description: string | null;
    price: string;
    thumbnail_url: string | null;
    rarity: string;
    available: boolean;
  }>(`SELECT id, category, name, description, price, thumbnail_url, rarity, available FROM cosmetics WHERE id = $1`, [
    cosmeticId,
  ]);

  const row = res.rows[0];
  if (!row) return null;

  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    thumbnailUrl: row.thumbnail_url,
    rarity: row.rarity,
    available: row.available,
  };
}

export async function purchaseCosmeticAtomic(
  userId: number,
  cosmeticId: string
): Promise<{ success: boolean; newBalance?: number; errorCode?: string }> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const cosmeticRes = await client.query<{ price: string; available: boolean }>(
      `SELECT price, available FROM cosmetics WHERE id = $1`,
      [cosmeticId]
    );
    const cosmeticRow = cosmeticRes.rows[0];
    if (!cosmeticRow || !cosmeticRow.available) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'cosmetic_not_found' };
    }

    const price = Number(cosmeticRow.price);

    const alreadyOwned = await client.query<{ id: string }>(
      `SELECT id FROM player_cosmetics WHERE user_id = $1 AND cosmetic_id = $2`,
      [userId, cosmeticId]
    );
    if (alreadyOwned.rows.length > 0) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'already_owned' };
    }

    const balanceRes = await client.query<{ coin_balance: string }>(
      `SELECT coin_balance FROM guest_users WHERE id = $1`,
      [userId]
    );
    const balanceRow = balanceRes.rows[0];
    if (!balanceRow) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'user_not_found' };
    }

    const currentBalance = Number(balanceRow.coin_balance);
    if (currentBalance < price) {
      await client.query('ROLLBACK');
      return { success: false, errorCode: 'insufficient_coins' };
    }

    const newBalance = currentBalance - price;
    await client.query(`UPDATE guest_users SET coin_balance = $2 WHERE id = $1`, [userId, newBalance]);

    await client.query(
      `INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
       VALUES ($1, $2, false)`,
      [userId, cosmeticId]
    );

    await client.query(
      `INSERT INTO cosmetics_transactions (user_id, cosmetic_id, price) VALUES ($1, $2, $3)`,
      [userId, cosmeticId, price]
    );

    await client.query('COMMIT');
    return { success: true, newBalance };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function equipCosmeticAtomic(userId: number, cosmeticId: string): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const ownedRes = await client.query<{ id: string; category: string }>(
      `SELECT pc.id, c.category FROM player_cosmetics pc
       JOIN cosmetics c ON c.id = pc.cosmetic_id
       WHERE pc.user_id = $1 AND pc.cosmetic_id = $2`,
      [userId, cosmeticId]
    );
    const ownedRow = ownedRes.rows[0];
    if (!ownedRow) {
      await client.query('ROLLBACK');
      return false;
    }

    const category = ownedRow.category;
    await client.query(
      `UPDATE player_cosmetics SET is_equipped = false
       WHERE user_id = $1 AND cosmetic_id IN (
         SELECT pc.cosmetic_id FROM player_cosmetics pc
         JOIN cosmetics c ON c.id = pc.cosmetic_id
         WHERE pc.user_id = $1 AND c.category = $2
       )`,
      [userId, category]
    );

    await client.query(`UPDATE player_cosmetics SET is_equipped = true WHERE user_id = $1 AND cosmetic_id = $2`, [
      userId,
      cosmeticId,
    ]);

    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCosmeticsTransactionHistory(
  deviceToken: string,
  limit = 20
): Promise<Array<{ id: string; name: string; price: number; purchasedAt: string }>> {
  const res = await getPool().query<{
    id: string;
    name: string;
    price: string;
    purchased_at: string;
  }>(
    `SELECT c.id, c.name, ct.price, ct.purchased_at
     FROM guest_users u
     JOIN cosmetics_transactions ct ON ct.user_id = u.id
     JOIN cosmetics c ON c.id = ct.cosmetic_id
     WHERE u.device_token = $1
     ORDER BY ct.purchased_at DESC
     LIMIT $2`,
    [deviceToken, limit]
  );

  return res.rows.map(row => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    purchasedAt: row.purchased_at,
  }));
}

export async function grantDefaultCosmeticsToPlayer(userId: number): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const defaultCosmetics = ['char_default', 'dice_default', 'board_default', 'emote_default'];
    for (const cosmeticId of defaultCosmetics) {
      await client.query(
        `INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped)
         VALUES ($1, $2, true)
         ON CONFLICT (user_id, cosmetic_id) DO NOTHING`,
        [userId, cosmeticId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface LeaderboardEntry {
  id: number;
  nickname: string;
  wins: number;
  gamesPlayed: number;
  coinBalance: number;
  capturesMade: number;
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
    `SELECT u.id, u.nickname,
            COALESCE(s.wins, 0) AS wins,
            COALESCE(s.games_played, 0) AS games_played,
            COALESCE(u.coin_balance, 0) AS coin_balance,
            COALESCE(s.captures_made, 0) AS captures_made,
            EXISTS(SELECT 1 FROM player_cosmetics WHERE user_id = u.id AND is_equipped = true) AS has_equipped
     FROM guest_users u
     LEFT JOIN user_stats s ON s.user_id = u.id
     WHERE s.wins > 0 OR s.games_played > 0
     ORDER BY COALESCE(s.wins, 0) DESC, COALESCE(s.games_played, 0) DESC
     LIMIT $1`,
    [limit]
  );

  return res.rows.map(row => ({
    id: Number(row.id),
    nickname: row.nickname,
    wins: Number(row.wins),
    gamesPlayed: Number(row.games_played),
    coinBalance: Number(row.coin_balance),
    capturesMade: Number(row.captures_made),
    hasEquippedCosmetic: row.has_equipped,
  }));
}
