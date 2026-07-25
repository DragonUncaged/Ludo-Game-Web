import { describe, expect, it } from 'vitest';
import {
  LAST_MAIN_POS,
  SAFE_CELLS,
  absCell,
  applyMove,
  applyRoll,
  chooseBotMove,
  createGame,
} from '../src/index.js';
import type { GameState, PlayerColor } from '../src/index.js';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function assertInvariants(state: GameState): void {
  const cellOwners = new Map<number, Set<string>>();
  for (const p of state.players) {
    expect(p.tokens).toHaveLength(4);
    for (const t of p.tokens) {
      expect(t).toBeGreaterThanOrEqual(-1);
      expect(t).toBeLessThanOrEqual(56);
      if (t >= 0 && t <= LAST_MAIN_POS) {
        const abs = absCell(p.color, t)!;
        if (!cellOwners.has(abs)) cellOwners.set(abs, new Set());
        cellOwners.get(abs)!.add(p.color);
      }
    }
  }
  for (const [cell, colors] of cellOwners) {
    if (!SAFE_CELLS.has(cell)) {
      expect(colors.size, `mixed colors on non-safe cell ${cell}`).toBe(1);
    }
  }
}

function playFullGame(colors: PlayerColor[], seed: number): GameState {
  const rng = lcg(seed);
  let state = createGame(colors);
  let plies = 0;
  while (state.phase !== 'gameOver') {
    expect(plies++).toBeLessThan(20000);
    const dice = 1 + Math.floor(rng() * 6);
    const roll = applyRoll(state, dice);
    state = roll.state;
    if (roll.moves.length > 0) {
      const move = chooseBotMove(state, roll.moves, 'normal', rng);
      const res = applyMove(state, move.tokenIndex);
      state = res.state;
      assertInvariants(state);
    }
  }
  return state;
}

describe('seeded full games terminate with consistent rankings', () => {
  for (const seed of [1, 1337, 90210]) {
    it(`4-player game, seed ${seed}`, () => {
      const end = playFullGame(['red', 'green', 'yellow', 'blue'], seed);
      const ranks = end.players.map((p) => p.finishedRank).sort();
      expect(ranks).toEqual([1, 2, 3, 4]);
      expect(end.turnCount).toBeLessThan(2000);
    });
    it(`2-player game, seed ${seed}`, () => {
      const end = playFullGame(['red', 'yellow'], seed);
      const ranks = end.players.map((p) => p.finishedRank).sort();
      expect(ranks).toEqual([1, 2]);
    });
  }
});
