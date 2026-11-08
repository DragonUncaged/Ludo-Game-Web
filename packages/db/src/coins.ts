import { getPool, withTransaction } from './pool.js';

export async function getCoinBalance(deviceToken: string): Promise<number | null> {
  const res = await getPool().query<{ coin_balance: string }>(
    `SELECT coin_balance FROM guest_users WHERE device_token = $1`,
    [deviceToken]
  );
  return res.rows[0] ? Number(res.rows[0].coin_balance) : null;
}

export type CoinTransactionType =
  'bet_placed' | 'bet_won' | 'bet_lost' | 'initial_allocation' | 'admin_adjustment' | 'daily_bonus';

export interface CoinTransaction {
  id: number;
  userId: number;
  matchId: number | null;
  transactionType: CoinTransactionType;
  amount: number;
  balanceAfter: number;
  description: string | null;
  createdAt: string;
}

export async function getCoinTransactionHistory(deviceToken: string, limit = 50): Promise<CoinTransaction[]> {
  const res = await getPool().query<{
    id: string;
    user_id: string;
    match_id: string | null;
    transaction_type: CoinTransactionType;
    amount: string;
    balance_after: string;
    description: string | null;
    created_at: string;
  }>(
    `SELECT ct.id, ct.user_id, ct.match_id, ct.transaction_type, ct.amount, ct.balance_after,
            ct.description, ct.created_at
     FROM guest_users u
     JOIN coin_transactions ct ON ct.user_id = u.id
     WHERE u.device_token = $1
     ORDER BY ct.created_at DESC
     LIMIT $2`,
    [deviceToken, limit]
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    matchId: row.match_id ? Number(row.match_id) : null,
    transactionType: row.transaction_type,
    amount: Number(row.amount),
    balanceAfter: Number(row.balance_after),
    description: row.description,
    createdAt: row.created_at,
  }));
}

export interface SettlementResult {
  /** What the losers actually paid. Can be short if someone spent coins mid-match. */
  collected: number;
  /** Always equal to `collected`. */
  awarded: number;
  /** Includes the winner's own stake, which never left their balance. */
  totalPool: number;
}

/**
 * Pays out a wagered match. Losers are debited under a row lock and never below
 * zero, and the winner gets exactly what was collected rather than the nominal
 * pot, so a player who went broke mid-match can't mint coins for anyone.
 */
export async function awardCoins(
  matchId: number,
  winnerId: number | null,
  stake: number,
  loserIds: number[]
): Promise<SettlementResult> {
  if (winnerId === null || stake <= 0 || loserIds.length === 0) {
    return { collected: 0, awarded: 0, totalPool: 0 };
  }

  return withTransaction(async (client) => {
    const lockBalance = async (userId: number) => {
      const res = await client.query<{ coin_balance: string }>(
        `SELECT coin_balance FROM guest_users WHERE id = $1 FOR UPDATE`,
        [userId]
      );
      return res.rows[0] ? Number(res.rows[0].coin_balance) : null;
    };
    const record = async (userId: number, type: CoinTransactionType, amount: number, balance: number) => {
      await client.query(`UPDATE guest_users SET coin_balance = $2 WHERE id = $1`, [userId, balance]);
      await client.query(
        `INSERT INTO coin_transactions (user_id, match_id, transaction_type, amount, balance_after, description)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, matchId, type, amount, balance, type === 'bet_won' ? 'Match win' : 'Match loss']
      );
    };

    let collected = 0;
    for (const userId of loserIds) {
      const balance = await lockBalance(userId);
      if (balance === null) continue;
      const loss = Math.min(stake, balance);
      if (loss <= 0) continue;
      collected += loss;
      await record(userId, 'bet_lost', -loss, balance - loss);
    }

    if (collected > 0) {
      const balance = await lockBalance(winnerId);
      if (balance !== null) await record(winnerId, 'bet_won', collected, balance + collected);
    }

    const totalPool = collected + stake;
    await client.query(`UPDATE matches SET bet_amount = $2, total_pool = $3 WHERE id = $1`, [
      matchId,
      stake,
      totalPool,
    ]);
    return { collected, awarded: collected, totalPool };
  });
}

export interface DailyBonusState {
  userId: number;
  balance: number;
  lastBonusAt: number | null;
  /** The database's clock. Cooldowns are judged against it so API hosts can disagree on time. */
  now: number;
}

export async function getDailyBonusState(deviceToken: string): Promise<DailyBonusState | null> {
  const res = await getPool().query<{
    id: string;
    coin_balance: string;
    last_bonus_at: Date | null;
    db_now: Date;
  }>(
    `SELECT id, coin_balance, last_bonus_at, now() AS db_now
       FROM guest_users WHERE device_token = $1`,
    [deviceToken]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    userId: Number(row.id),
    balance: Number(row.coin_balance),
    lastBonusAt: row.last_bonus_at ? row.last_bonus_at.getTime() : null,
    now: row.db_now.getTime(),
  };
}

export interface DailyBonusClaim {
  /** False if another claim got there first (double click, second tab). */
  claimed: boolean;
  amount: number;
  balance: number;
  lastBonusAt: number | null;
}

/**
 * The cooldown check lives in the UPDATE's WHERE clause, so of two racing claims
 * only one matches a row. The amount comes from the caller (the shared
 * `dailyBonusAmount`) so the payout rule isn't duplicated in SQL.
 */
export async function claimDailyBonus(
  deviceToken: string,
  amount: number,
  cooldownMs: number
): Promise<DailyBonusClaim | null> {
  const credit = Math.max(0, Math.floor(amount));
  const claim = await withTransaction(async (client) => {
    const res = await client.query<{ id: string; coin_balance: string; last_bonus_at: Date }>(
      `UPDATE guest_users
          SET coin_balance = coin_balance + $2, last_bonus_at = now()
        WHERE device_token = $1
          AND (last_bonus_at IS NULL OR last_bonus_at <= now() - make_interval(secs => $3))
        RETURNING id, coin_balance, last_bonus_at`,
      [deviceToken, credit, cooldownMs / 1000]
    );
    const row = res.rows[0];
    if (!row) return null;

    const balance = Number(row.coin_balance);
    await client.query(
      `INSERT INTO coin_transactions (user_id, match_id, transaction_type, amount, balance_after, description)
       VALUES ($1, NULL, 'daily_bonus', $2, $3, 'Daily bonus')`,
      [Number(row.id), credit, balance]
    );
    return { claimed: true, amount: credit, balance, lastBonusAt: row.last_bonus_at.getTime() };
  });
  if (claim) return claim;

  const current = await getDailyBonusState(deviceToken);
  return current && { claimed: false, amount: 0, balance: current.balance, lastBonusAt: current.lastBonusAt };
}
