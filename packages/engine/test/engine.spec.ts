import { describe, expect, it } from 'vitest';
import {
  applyMove,
  applyRoll,
  createGame,
  deserializeGame,
  legalMoves,
  serializeGame,
} from '../src/index.js';
import type { GameState } from '../src/index.js';

function game4(): GameState {
  return createGame(['red', 'green', 'yellow', 'blue']);
}

/** Force token positions for scenario setup. */
function place(state: GameState, playerIdx: number, tokens: number[]): GameState {
  const next = structuredClone(state);
  next.players[playerIdx]!.tokens = [...tokens] as GameState['players'][number]['tokens'];
  return next;
}

describe('rolling', () => {
  it('non-6 with all tokens based auto-passes to the next player', () => {
    const g = game4();
    const r = applyRoll(g, 3);
    expect(r.autoPass).toBe(true);
    expect(r.state.current).toBe(1);
    expect(r.state.phase).toBe('awaitRoll');
  });

  it('a 6 offers base exit to pos 0', () => {
    const g = game4();
    const r = applyRoll(g, 6);
    expect(r.autoPass).toBe(false);
    expect(r.moves).toHaveLength(4);
    expect(r.moves[0]).toMatchObject({ from: -1, to: 0, isExitBase: true });
  });

  it('third consecutive six forfeits the turn', () => {
    let g = place(game4(), 0, [0, -1, -1, -1]);
    // six #1: move, extra roll
    let roll = applyRoll(g, 6);
    g = applyMove(roll.state, roll.moves[0]!.tokenIndex).state;
    expect(g.current).toBe(0);
    expect(g.consecutiveSixes).toBe(1);
    // six #2
    roll = applyRoll(g, 6);
    g = applyMove(roll.state, roll.moves.find((m) => !m.isExitBase)!.tokenIndex).state;
    expect(g.consecutiveSixes).toBe(2);
    // six #3: forfeit — no move offered, turn passes, counter reset
    roll = applyRoll(g, 6);
    expect(roll.forfeit).toBe(true);
    expect(roll.moves).toHaveLength(0);
    expect(roll.state.current).toBe(1);
    expect(roll.state.consecutiveSixes).toBe(0);
  });

  it('a 6 grants an extra roll after the move', () => {
    const g = place(game4(), 0, [5, -1, -1, -1]);
    const roll = applyRoll(g, 6);
    const res = applyMove(roll.state, roll.moves.find((m) => !m.isExitBase)!.tokenIndex);
    expect(res.state.current).toBe(0);
    expect(res.state.phase).toBe('awaitRoll');
    expect(res.events.some((e) => e.type === 'extraRoll')).toBe(true);
  });
});

describe('movement and captures', () => {
  it('captures an opponent on a non-safe cell', () => {
    // red at rel 1, dice 1 → rel 2 = abs 3; green at rel 41 = abs (14+41)%52 = 3
    let g = place(game4(), 0, [1, -1, -1, -1]);
    g = place(g, 1, [41, -1, -1, -1]);
    const roll = applyRoll(g, 1);
    const move = roll.moves.find((m) => m.tokenIndex === 0)!;
    expect(move.captures).toHaveLength(1);
    const res = applyMove(roll.state, 0);
    expect(res.state.players[1]!.tokens[0]).toBe(-1);
    expect(res.events.some((e) => e.type === 'captured')).toBe(true);
  });

  it('captures all stacked opponents on one cell', () => {
    let g = place(game4(), 0, [1, -1, -1, -1]);
    g = place(g, 1, [41, 41, -1, -1]);
    const roll = applyRoll(g, 1);
    const res = applyMove(roll.state, 0);
    expect(res.state.players[1]!.tokens[0]).toBe(-1);
    expect(res.state.players[1]!.tokens[1]).toBe(-1);
    expect(res.events.filter((e) => e.type === 'captured')).toHaveLength(2);
  });

  it('does not capture on safe star cells — tokens co-exist', () => {
    // abs 9 is a safe star. red rel pos for abs 9 = 8; green rel = (9-14+52)%52 = 47
    let g = place(game4(), 0, [7, -1, -1, -1]);
    g = place(g, 1, [47, -1, -1, -1]);
    const roll = applyRoll(g, 1);
    const move = roll.moves.find((m) => m.tokenIndex === 0)!;
    expect(move.to).toBe(8);
    expect(move.captures).toHaveLength(0);
    const res = applyMove(roll.state, 0);
    expect(res.state.players[1]!.tokens[0]).toBe(47);
  });

  it('does not capture on start cells (base exit is safe)', () => {
    // green start abs 14; red rel pos for abs 14 = 13
    let g = place(game4(), 0, [13, -1, -1, -1]);
    g = place(g, 1, [-1, -1, -1, -1]);
    const rollG = applyRoll({ ...structuredClone(g), current: 1 }, 6);
    expect(rollG.moves[0]!.captures).toHaveLength(0);
  });
});

describe('home column and finishing', () => {
  it('requires an exact roll to finish', () => {
    const g = place(game4(), 0, [54, -1, -1, -1]);
    const over = applyRoll(g, 3); // 54+3=57 → overshoot; other tokens based, non-6 → no moves
    expect(over.autoPass).toBe(true);
    const exact = applyRoll(g, 2); // 54+2=56 ✓
    expect(exact.moves).toHaveLength(1);
    expect(exact.moves[0]!.isFinish).toBe(true);
  });

  it('never wraps past pos 50 into the shared path again', () => {
    const g = place(game4(), 3, [20, -1, -1, -1]);
    // blue at rel 20 = abs (40+20)%52 = 8 — still on shared path
    const moves = legalMoves({ ...g, current: 3 }, 4);
    expect(moves[0]!.to).toBe(24);
    expect(moves[0]!.entersHome).toBe(false);
  });

  it('entersHome flags the transition into the home column', () => {
    const g = place(game4(), 0, [49, -1, -1, -1]);
    const roll = applyRoll(g, 4); // 49+4=53 → home column
    expect(roll.moves[0]!.entersHome).toBe(true);
  });

  it('six with no legal move auto-passes (all tokens deep in home)', () => {
    const g = place(game4(), 0, [55, 55, 55, 52]);
    // dice 6: 55+6, 52+6 all > 56 → no moves even with a 6
    const roll = applyRoll(g, 6);
    expect(roll.autoPass).toBe(true);
    expect(roll.state.current).toBe(1);
  });

  it('finished player is ranked, skipped, and the game continues', () => {
    let g = place(game4(), 0, [56, 56, 56, 55]);
    const roll = applyRoll(g, 1);
    const res = applyMove(roll.state, 3);
    expect(res.state.players[0]!.finishedRank).toBe(1);
    expect(res.events.some((e) => e.type === 'playerFinished')).toBe(true);
    expect(res.state.phase).toBe('awaitRoll');
    expect(res.state.current).toBe(1);
    // red is skipped from now on
    let s = res.state;
    const r2 = applyRoll(s, 2); // green all based → autopass to yellow
    expect(r2.state.current).toBe(2);
  });

  it('2-player game ends when one finishes; loser gets last rank', () => {
    let g = createGame(['red', 'yellow']);
    g = place(g, 0, [56, 56, 56, 55]);
    const roll = applyRoll(g, 1);
    const res = applyMove(roll.state, 3);
    expect(res.state.phase).toBe('gameOver');
    expect(res.state.players[0]!.finishedRank).toBe(1);
    expect(res.state.players[1]!.finishedRank).toBe(2);
    const over = res.events.find((e) => e.type === 'gameOver');
    expect(over).toBeDefined();
    if (over?.type === 'gameOver') expect(over.ranking).toEqual([0, 1]);
  });

  it('no extra roll when the player finishes on a 6', () => {
    let g = place(game4(), 0, [56, 56, 56, 50]);
    const roll = applyRoll(g, 6); // 50+6=56 exact finish
    const res = applyMove(roll.state, 3);
    expect(res.state.players[0]!.finishedRank).toBe(1);
    expect(res.events.some((e) => e.type === 'extraRoll')).toBe(false);
    expect(res.state.current).toBe(1);
  });
});

describe('serialization', () => {
  it('round-trips and play continues identically', () => {
    const g = place(game4(), 0, [10, -1, 54, 56]);
    const restored = deserializeGame(serializeGame(g));
    expect(restored).toEqual(g);
    const a = applyRoll(g, 2);
    const b = applyRoll(restored, 2);
    expect(a.moves).toEqual(b.moves);
  });
});
