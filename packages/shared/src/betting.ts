// Pot math for wagered matches. The server settles with it and the lobby and
// summary screens preview with it, so they can't disagree.
//
// Winner takes all: each human with an account stakes `betAmount` and the
// best-ranked one collects, netting stake × (bettors - 1). Bots never stake.
// Quitting still costs your stake. Fewer than two bettors voids the wager.

/** A seat as it exists at settlement time. */
export interface BettingSeat {
  seat: number;
  /** Never staked: a bot that was seated from the start. */
  isBot: boolean;
  /** Null for a human we couldn't save to the DB; they sit the wager out. */
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
 * Coin change to show a seat on the summary screen. The client has no account
 * ids, so pass `userId: 0` for humans.
 */
export function coinDeltaForSeat(betAmount: number, seats: BettingSeat[], seat: number): number {
  const settlement = computeSettlement(betAmount, seats);
  if (settlement.bettorCount === 0) return 0;
  const me = seats.find((s) => s.seat === seat);
  if (!me || !isBettor(me)) return 0;
  return seat === settlement.winnerSeat ? settlement.winnerNet : -settlement.stake;
}
