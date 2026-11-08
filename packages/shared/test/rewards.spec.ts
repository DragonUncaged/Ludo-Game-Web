import { describe, expect, it } from 'vitest';
import {
  DAILY_BONUS_BASE,
  DAILY_BONUS_COOLDOWN_MS,
  DAILY_BONUS_FLOOR,
  computeDailyBonus,
  dailyBonusAmount,
  formatCooldown,
} from '../src/index.js';

const NOW = 1_700_000_000_000; // fixed clock; the module never reads Date.now()

describe('dailyBonusAmount', () => {
  it('pays the base amount to a player who is not short', () => {
    expect(dailyBonusAmount(DAILY_BONUS_FLOOR)).toBe(DAILY_BONUS_BASE);
    expect(dailyBonusAmount(5000)).toBe(DAILY_BONUS_BASE);
  });

  it('lifts a broke player back to the floor', () => {
    expect(dailyBonusAmount(0)).toBe(DAILY_BONUS_FLOOR);
    expect(dailyBonusAmount(40)).toBe(DAILY_BONUS_FLOOR - 40);
  });

  it('never pays less than the base near the floor', () => {
    expect(dailyBonusAmount(DAILY_BONUS_FLOOR - 1)).toBe(DAILY_BONUS_BASE);
  });

  it('treats junk balances as broke rather than paying NaN', () => {
    expect(dailyBonusAmount(Number.NaN)).toBe(DAILY_BONUS_FLOOR);
    expect(dailyBonusAmount(-50)).toBe(DAILY_BONUS_FLOOR);
  });
});

describe('computeDailyBonus', () => {
  it('is claimable when never claimed before', () => {
    const s = computeDailyBonus(100, null, NOW);
    expect(s).toMatchObject({ claimable: true, amount: DAILY_BONUS_BASE, msRemaining: 0 });
  });

  it('locks for a full window straight after a claim', () => {
    const s = computeDailyBonus(100, NOW, NOW);
    expect(s.claimable).toBe(false);
    expect(s.amount).toBe(0);
    expect(s.msRemaining).toBe(DAILY_BONUS_COOLDOWN_MS);
    expect(s.nextClaimAt).toBe(NOW + DAILY_BONUS_COOLDOWN_MS);
  });

  it('stays locked one millisecond early and opens exactly on the boundary', () => {
    const claimedAt = NOW - DAILY_BONUS_COOLDOWN_MS;
    expect(computeDailyBonus(100, claimedAt + 1, NOW).claimable).toBe(false);
    expect(computeDailyBonus(100, claimedAt, NOW).claimable).toBe(true);
  });

  it('holds the claim when the stored timestamp is in the future (clock skew)', () => {
    const s = computeDailyBonus(0, NOW + 60_000, NOW);
    expect(s.claimable).toBe(false);
    expect(s.msRemaining).toBe(DAILY_BONUS_COOLDOWN_MS + 60_000);
  });

  it('quotes the top-up amount for a broke player who is off cooldown', () => {
    const s = computeDailyBonus(0, NOW - DAILY_BONUS_COOLDOWN_MS, NOW);
    expect(s).toMatchObject({ claimable: true, amount: DAILY_BONUS_FLOOR });
  });

  it('rescues a wiped-out player: one claim funds another wager', () => {
    // Betting is zero-sum, so without this a broke player could never bet again.
    const s = computeDailyBonus(0, null, NOW);
    expect(s.amount).toBeGreaterThan(0);
    expect(0 + s.amount).toBe(DAILY_BONUS_FLOOR);
  });
});

describe('formatCooldown', () => {
  it('renders hours, minutes and seconds', () => {
    expect(formatCooldown(0)).toBe('0s');
    expect(formatCooldown(30_000)).toBe('30s');
    expect(formatCooldown(90_000)).toBe('1m');
    expect(formatCooldown(3 * 3600_000)).toBe('3h');
    expect(formatCooldown(3 * 3600_000 + 30 * 60_000)).toBe('3h 30m');
    expect(formatCooldown(DAILY_BONUS_COOLDOWN_MS)).toBe('24h');
  });
});
