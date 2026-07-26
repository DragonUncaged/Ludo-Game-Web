import { describe, expect, it } from 'vitest';
import { DynamicDice, FairDice, createGame } from '../src/index.js';
import type { GameState, RollContext } from '../src/index.js';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function makeRandInt(rng: () => number) {
  return (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo));
}

function place(state: GameState, playerIdx: number, tokens: number[]): GameState {
  const next = structuredClone(state);
  next.players[playerIdx]!.tokens = [...tokens] as GameState['players'][number]['tokens'];
  return next;
}

const P6_MIN = 0.123;
const P6_MAX = 0.334;

function p6(weights: number[]): number {
  return weights[5]! / weights.reduce((a, b) => a + b, 0);
}

describe('fair dice', () => {
  it('is roughly uniform over 12k rolls', () => {
    const dice = new FairDice(makeRandInt(lcg(42)));
    const counts = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < 12000; i++) counts[dice.roll().value - 1]!++;
    for (const c of counts) {
      expect(c / 12000).toBeGreaterThan(0.14);
      expect(c / 12000).toBeLessThan(0.2);
    }
  });
});

describe('dynamic dice', () => {
  const base = createGame(['red', 'green', 'yellow', 'blue']);

  it('worst-case drought maxes out at exactly the clamp (P6 = 1/3)', () => {
    const dice = new DynamicDice(makeRandInt(lcg(7)));
    const ctx: RollContext = { state: base, playerIdx: 0, rollsSinceSix: 30 };
    const w = dice.weightsFor(ctx);
    expect(w[5]).toBe(2.5);
    expect(p6(w)).toBeCloseTo(1 / 3, 2);
    // empirical: 10k samples stay near 1/3
    let sixes = 0;
    for (let i = 0; i < 10000; i++) if (dice.roll(ctx).value === 6) sixes++;
    expect(sixes / 10000).toBeGreaterThan(0.3);
    expect(sixes / 10000).toBeLessThan(0.37);
  });

  it('anti-runaway lowers but never breaches the floor', () => {
    let g = place(base, 0, [40, 40, 40, 40]); // progress 160, everyone else 0
    const dice = new DynamicDice(makeRandInt(lcg(9)));
    const w = dice.weightsFor({ state: g, playerIdx: 0, rollsSinceSix: 0 });
    expect(w[5]).toBeCloseTo(0.85, 5);
    expect(p6(w)).toBeGreaterThan(P6_MIN);
  });

  it('comeback boosts high faces for a trailing player', () => {
    let g = place(base, 1, [30, 30, 10, 10]); // leader green, red trails at 0
    const dice = new DynamicDice(makeRandInt(lcg(11)));
    const w = dice.weightsFor({ state: g, playerIdx: 0, rollsSinceSix: 0 });
    expect(w[3]).toBeGreaterThan(1);
    expect(w[4]).toBeGreaterThan(1);
  });

  it('P(6) stays inside the fairness bounds across a scenario matrix', () => {
    const dice = new DynamicDice(makeRandInt(lcg(13)));
    const scenarios: RollContext[] = [];
    for (const rolls of [0, 3, 5, 8, 15, 40]) {
      scenarios.push({ state: base, playerIdx: 0, rollsSinceSix: rolls });
      scenarios.push({
        state: place(base, 0, [40, 40, 40, 40]),
        playerIdx: 0,
        rollsSinceSix: rolls,
      });
      scenarios.push({
        state: place(place(base, 1, [40, 40, 40, 40]), 0, [-1, -1, -1, -1]),
        playerIdx: 0,
        rollsSinceSix: rolls,
      });
    }
    for (const ctx of scenarios) {
      const w = dice.weightsFor(ctx);
      expect(p6(w)).toBeGreaterThanOrEqual(P6_MIN);
      expect(p6(w)).toBeLessThanOrEqual(P6_MAX);
      for (const x of w) {
        expect(x).toBeGreaterThanOrEqual(0.7);
        expect(x).toBeLessThanOrEqual(2.5);
      }
    }
  });
});
