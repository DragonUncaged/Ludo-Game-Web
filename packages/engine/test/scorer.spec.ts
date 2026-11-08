import { describe, expect, it } from 'vitest';
import { applyRoll, createGame, pickBestMove, rankMoves } from '../src/index.js';
import type { GameState } from '../src/index.js';

function place(state: GameState, playerIdx: number, tokens: number[]): GameState {
  const next = structuredClone(state);
  next.players[playerIdx]!.tokens = [...tokens] as GameState['players'][number]['tokens'];
  return next;
}

describe('move scorer', () => {
  it('prefers a capture over a plain advance', () => {
    let g = createGame(['red', 'green', 'yellow', 'blue']);
    g = place(g, 0, [1, 10, -1, -1]);
    g = place(g, 1, [41, -1, -1, -1]); // abs 3, so red token 0 captures with a 1 (rel 1 → 2 = abs 3)
    const roll = applyRoll(g, 1);
    const best = pickBestMove(roll.state, roll.moves);
    expect(best.tokenIndex).toBe(0);
    expect(best.captures).toHaveLength(1);
  });

  it('prefers finishing over advancing', () => {
    let g = createGame(['red', 'green', 'yellow', 'blue']);
    g = place(g, 0, [54, 10, -1, -1]);
    const roll = applyRoll(g, 2);
    const best = pickBestMove(roll.state, roll.moves);
    expect(best.isFinish).toBe(true);
  });

  it('prefers leaving base with a 6 when the board is empty for us', () => {
    let g = createGame(['red', 'green', 'yellow', 'blue']);
    g = place(g, 0, [10, -1, -1, -1]);
    const roll = applyRoll(g, 6);
    const best = pickBestMove(roll.state, roll.moves);
    expect(best.isExitBase).toBe(true);
  });

  it('prefers a safe cell over a threatened cell', () => {
    let g = createGame(['red', 'green', 'yellow', 'blue']);
    // token 0: pos 4 → 6 (abs 7), threatened by green at abs 2 (needs 5)
    // token 1: pos 24 → 26 (abs 27 = yellow start, safe)
    g = place(g, 0, [4, 24, -1, -1]);
    g = place(g, 1, [40, -1, -1, -1]); // green rel 40 = abs 2
    const roll = applyRoll(g, 2);
    const ranked = rankMoves(roll.state, roll.moves);
    expect(ranked[0]!.move.tokenIndex).toBe(1);
  });
});
