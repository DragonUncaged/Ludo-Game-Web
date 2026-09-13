// The coin faucet.
//
// Every other coin flow in the game is a transfer (betting) or a sink
// (cosmetics), so the only coins that have ever existed are the 100 a guest is
// created with. A player who wagers those away is locked out of betting and the
// shop for good. The daily bonus is the one place new coins enter the economy.
//
// Rules:
//  - One claim per account per cooldown window (24h), server-clocked.
//  - A claim pays `DAILY_BONUS_BASE`, or enough to lift a broke player back to
//    `DAILY_BONUS_FLOOR` — whichever is larger. So losing everything costs you a
//    day, not the account.

export const DAILY_BONUS_BASE = 25;
/** A claim tops a poorer player up to here, matching the starting balance. */
export const DAILY_BONUS_FLOOR = 100;
export const DAILY_BONUS_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface DailyBonusStatus {
  claimable: boolean;
  /** Coins a claim right now would pay; 0 while on cooldown. */
  amount: number;
  /** Epoch ms the next claim unlocks; equals `now` when claimable. */
  nextClaimAt: number;
  /** Milliseconds left on the cooldown; 0 when claimable. */
  msRemaining: number;
}

/** Coins a claim pays at this balance, independent of the cooldown. */
export function dailyBonusAmount(balance: number): number {
  const safe = Number.isFinite(balance) ? Math.max(0, Math.floor(balance)) : 0;
  return Math.max(DAILY_BONUS_BASE, DAILY_BONUS_FLOOR - safe);
}

/**
 * @param balance      current coin balance
 * @param lastClaimAt  epoch ms of the last claim, or null if never claimed
 * @param now          epoch ms — pass the *server's* clock, never the browser's
 */
export function computeDailyBonus(
  balance: number,
  lastClaimAt: number | null,
  now: number
): DailyBonusStatus {
  const amount = dailyBonusAmount(balance);
  if (lastClaimAt === null || !Number.isFinite(lastClaimAt)) {
    return { claimable: true, amount, nextClaimAt: now, msRemaining: 0 };
  }
  // A future timestamp means a clock moved backwards; hold the claim rather than
  // handing out a free one every time the skew is re-read.
  const nextClaimAt = lastClaimAt + DAILY_BONUS_COOLDOWN_MS;
  const msRemaining = Math.max(0, nextClaimAt - now);
  if (msRemaining > 0) return { claimable: false, amount: 0, nextClaimAt, msRemaining };
  return { claimable: true, amount, nextClaimAt: now, msRemaining: 0 };
}

/** "12h 30m" / "45m" / "30s" — for the claim button's cooldown label. */
export function formatCooldown(msRemaining: number): string {
  const total = Math.max(0, Math.ceil(msRemaining / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${total}s`;
}
