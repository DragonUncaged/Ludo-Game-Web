// Coin settlement math for wagered matches.
//
// Single source of truth: the realtime server settles with it, the client
// previews with it. Keeping both on the same function is what stops the lobby
// from promising a payout the server never pays.
//
// Rules (winner-takes-all MVP):
//  - Only humans who are linked to a stored account can stake. Bots never
//    contribute to the pot and never collect it.
//  - Every bettor puts in `betAmount`; the pot is `betAmount × bettors`.
//  - The best-ranked bettor takes the pot. Their own stake comes back with it,
//    so their *net* gain is `betAmount × (bettors − 1)` — exactly the sum the
//    losers give up. Coins are conserved.
//  - Abandoning a wagered match forfeits the stake: the seat still pays in but
//    can never collect, however well the bot that took over plays it.
//  - Fewer than two bettors means there is nothing to play for; nobody pays.

/** A seat as it exists at settlement time. */
export interface BettingSeat {
  seat: number;
  /** True for a seat that never staked — a bot that was in the room from the start. */
  isBot: boolean;
  /** Account id; null for a human we could not persist (bet is voided for them). */
  userId: number | null;
  /** 1-based finishing rank; the engine ranks every seat. */
  rank: number;
  /** Staked, then walked out mid-match: pays into the pot but cannot win it. */
  forfeited?: boolean;
}

export interface CoinSettlement {
  /** Total coins staked across all bettors. */
  pot: number;
  /** Per-bettor stake (0 when the match was not wagered). */
  stake: number;
  /** Account that collects the pot, or null when nothing is settled. */
  winnerId: number | null;
  /** Seat that collects the pot, or -1 when nothing is settled. */
  winnerSeat: number;
  /** Coins the winner ends up ahead by, once their own stake is returned. */
  winnerNet: number;
  /** Accounts that forfeit their stake. */
  loserIds: number[];
  /** Number of seats that actually staked. */
  bettorCount: number;
}

const EMPTY: CoinSettlement = {
  pot: 0,
  stake: 0,
  winnerId: null,
  winnerSeat: -1,
  winnerNet: 0,
  loserIds: [],
  bettorCount: 0,
};

/** True when this seat's coins are on the line. */
export function isBettor(seat: Pick<BettingSeat, 'isBot' | 'userId'>): boolean {
  return !seat.isBot && seat.userId !== null;
}

export function computeSettlement(betAmount: number, seats: BettingSeat[]): CoinSettlement {
  const stake = Math.max(0, Math.floor(betAmount));
  if (stake === 0) return EMPTY;

  const bettors = seats.filter(isBettor);
  if (bettors.length < 2) return EMPTY;

  // Quitters still pay in, but the pot can only go to someone who saw it out.
  // If nobody did, there is no one to pay it to and the whole wager is void.
  const eligible = bettors.filter((s) => !s.forfeited);
  if (eligible.length === 0) return EMPTY;

  // Ties cannot happen (ranks are unique) but sort by seat as a stable tiebreak.
  const winner = eligible.reduce((best, s) =>
    s.rank < best.rank || (s.rank === best.rank && s.seat < best.seat) ? s : best
  );
  const losers = bettors.filter((s) => s.seat !== winner.seat);

  return {
    pot: stake * bettors.length,
    stake,
    winnerId: winner.userId,
    winnerSeat: winner.seat,
    winnerNet: stake * losers.length,
    loserIds: losers.map((s) => s.userId!),
    bettorCount: bettors.length,
  };
}

/**
 * Coin change a seat should see on the summary screen.
 * Mirrors `computeSettlement` for seats we have no account id for (the client
 * never learns user ids), so pass `userId: 0` for any human seat.
 */
export function coinDeltaForSeat(betAmount: number, seats: BettingSeat[], seat: number): number {
  const settlement = computeSettlement(betAmount, seats);
  if (settlement.bettorCount === 0) return 0;
  const me = seats.find((s) => s.seat === seat);
  if (!me || !isBettor(me)) return 0;
  return seat === settlement.winnerSeat ? settlement.winnerNet : -settlement.stake;
}
