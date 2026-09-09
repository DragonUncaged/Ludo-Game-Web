import { describe, expect, it } from 'vitest';
import { coinDeltaForSeat, computeSettlement } from '@ludo/shared';
import type { BettingSeat } from '@ludo/shared';

/** Four seats, ranked in seat order, all human unless overridden. */
function seats(overrides: Array<Partial<BettingSeat>> = []): BettingSeat[] {
  return overrides.map((o, i) => ({
    seat: i,
    isBot: false,
    userId: 100 + i,
    rank: i + 1,
    ...o,
  }));
}

const four = () => seats([{}, {}, {}, {}]);

describe('computeSettlement', () => {
  it('pays nothing when the match was not wagered', () => {
    const s = computeSettlement(0, four());
    expect(s).toMatchObject({ pot: 0, winnerId: null, winnerNet: 0, loserIds: [] });
  });

  it('conserves coins: the winner nets exactly what the losers give up', () => {
    const s = computeSettlement(50, four());
    expect(s.bettorCount).toBe(4);
    expect(s.pot).toBe(200);
    expect(s.winnerId).toBe(100);
    expect(s.winnerNet).toBe(150);
    expect(s.loserIds).toEqual([101, 102, 103]);
    expect(s.winnerNet).toBe(s.stake * s.loserIds.length);
  });

  it('excludes bots from the pot', () => {
    // Two humans, two bots — the pot is 2 stakes, not 4.
    const s = computeSettlement(50, seats([{}, { isBot: true, userId: null }, {}, { isBot: true, userId: null }]));
    expect(s.bettorCount).toBe(2);
    expect(s.pot).toBe(100);
    expect(s.winnerNet).toBe(50);
    expect(s.loserIds).toEqual([102]);
  });

  it('hands the pot to the best-ranked human when a bot finishes first', () => {
    const s = computeSettlement(
      20,
      seats([
        { isBot: true, userId: null, rank: 1 },
        { rank: 2 },
        { rank: 3 },
        { rank: 4 },
      ])
    );
    expect(s.winnerSeat).toBe(1);
    expect(s.winnerId).toBe(101);
    expect(s.winnerNet).toBe(40);
    expect(s.loserIds).toEqual([102, 103]);
  });

  it('voids the wager when only one seat can stake', () => {
    const s = computeSettlement(
      50,
      seats([{}, { isBot: true, userId: null }, { isBot: true, userId: null }, { isBot: true, userId: null }])
    );
    expect(s).toMatchObject({ pot: 0, winnerId: null, winnerNet: 0, loserIds: [] });
  });

  it('skips humans with no stored account', () => {
    const s = computeSettlement(30, seats([{}, { userId: null }, {}, {}]));
    expect(s.bettorCount).toBe(3);
    expect(s.loserIds).toEqual([102, 103]);
    expect(s.winnerNet).toBe(60);
  });

  it('finds the winner regardless of the order seats are passed in', () => {
    const shuffled = [
      { seat: 2, isBot: false, userId: 102, rank: 3 },
      { seat: 0, isBot: false, userId: 100, rank: 2 },
      { seat: 3, isBot: false, userId: 103, rank: 1 },
      { seat: 1, isBot: false, userId: 101, rank: 4 },
    ];
    const s = computeSettlement(10, shuffled);
    expect(s.winnerSeat).toBe(3);
    expect(s.winnerId).toBe(103);
  });

  it('floors fractional stakes and rejects negatives', () => {
    expect(computeSettlement(10.9, four()).stake).toBe(10);
    expect(computeSettlement(-5, four()).stake).toBe(0);
  });
});

describe('coinDeltaForSeat', () => {
  it('sums to zero across the table', () => {
    const table = four();
    const total = table.reduce((sum, s) => sum + coinDeltaForSeat(50, table, s.seat), 0);
    expect(total).toBe(0);
  });

  it('matches the settlement the server applies', () => {
    const table = seats([{}, { isBot: true, userId: null }, {}, {}]);
    const s = computeSettlement(25, table);
    expect(coinDeltaForSeat(25, table, s.winnerSeat)).toBe(s.winnerNet);
    expect(coinDeltaForSeat(25, table, 2)).toBe(-25);
    expect(coinDeltaForSeat(25, table, 1)).toBe(0); // bot
  });

  it('shows no change when the wager is void', () => {
    const table = seats([{}, { isBot: true, userId: null }, { isBot: true, userId: null }]);
    expect(coinDeltaForSeat(50, table, 0)).toBe(0);
  });

  it('works from the client, which stands in 0 for every human account id', () => {
    const clientView: BettingSeat[] = [
      { seat: 0, isBot: false, userId: 0, rank: 2 },
      { seat: 1, isBot: false, userId: 0, rank: 1 },
      { seat: 2, isBot: true, userId: null, rank: 3 },
    ];
    expect(coinDeltaForSeat(40, clientView, 1)).toBe(40);
    expect(coinDeltaForSeat(40, clientView, 0)).toBe(-40);
    expect(coinDeltaForSeat(40, clientView, 2)).toBe(0);
  });
});
