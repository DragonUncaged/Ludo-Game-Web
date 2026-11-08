import { POS_BASE } from './types.js';
import type { GameState } from './types.js';

export interface RollContext {
  state: GameState;
  playerIdx: number;
  /** rolls by this player since their last 6 */
  rollsSinceSix: number;
}

export interface DiceRoll {
  value: number;
  /** weights used for this roll; the server logs them */
  weights: number[];
}

export interface DiceRoller {
  roll(ctx: RollContext): DiceRoll;
}

export type RandInt = (loInclusive: number, hiExclusive: number) => number;

/** Plain uniform dice. Anything competitive should use these. */
export class FairDice implements DiceRoller {
  constructor(private randInt: RandInt) {}
  roll(): DiceRoll {
    return { value: this.randInt(1, 7), weights: [1, 1, 1, 1, 1, 1] };
  }
}

const CLAMP_MIN = 0.7;
const CLAMP_MAX = 2.5;

function progressOf(state: GameState, playerIdx: number): number {
  return state.players[playerIdx]!.tokens.reduce((sum, t) => sum + Math.max(t, 0), 0);
}

/**
 * Casual mode only. Nudges the odds toward players stuck in base or far behind,
 * but every weight is clamped so P(6) stays within [12.3%, 33.3%] (fair is 16.7%).
 * The randomness itself still comes from the injected randInt.
 */
export class DynamicDice implements DiceRoller {
  constructor(private randInt: RandInt) {}

  weightsFor(ctx: RollContext): number[] {
    const { state, playerIdx, rollsSinceSix } = ctx;
    const w = [1, 1, 1, 1, 1, 1];
    const me = state.players[playerIdx]!;
    const allBased = me.tokens.every((t) => t === POS_BASE);

    // Drought breaker: help players stuck waiting for a 6.
    const droughtAt = allBased ? 3 : 5;
    if (rollsSinceSix >= droughtAt) {
      w[5]! *= 1 + 0.25 * (rollsSinceSix - (droughtAt - 1));
    }

    // Comeback / anti-runaway, judged on total board progress.
    const progresses = state.players.map((_, i) => progressOf(state, i));
    const mine = progresses[playerIdx]!;
    const best = Math.max(...progresses);
    const worst = Math.min(...progresses);
    if (mine === worst && best - mine >= 20) {
      w[3]! *= 1.15;
      w[4]! *= 1.15;
      w[5]! *= 1.15;
    }
    if (mine === best && progresses.every((p, i) => i === playerIdx || mine - p >= 25)) {
      w[5]! *= 0.85;
    }

    return w.map((x) => Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, x)));
  }

  roll(ctx: RollContext): DiceRoll {
    const weights = this.weightsFor(ctx);
    const ints = weights.map((x) => Math.round(x * 100));
    const total = ints.reduce((a, b) => a + b, 0);
    let r = this.randInt(0, total);
    for (let i = 0; i < 6; i++) {
      r -= ints[i]!;
      if (r < 0) return { value: i + 1, weights };
    }
    return { value: 6, weights };
  }
}
