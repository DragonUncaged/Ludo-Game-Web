import { SAFE_CELLS } from './constants.js';
import { absCell } from './path.js';
import { LAST_MAIN_POS } from './types.js';
import type { GameState, Move } from './types.js';

export interface ScoreWeights {
  capture: number;
  captureVictimProgress: number;
  finish: number;
  enterHome: number;
  exitBase: number;
  exitBaseSaturated: number;
  landSafe: number;
  escapeThreat: number;
  dangerPerThreat: number;
  progress: number;
  jitter: number;
}

export const DEFAULT_WEIGHTS: ScoreWeights = {
  capture: 40,
  captureVictimProgress: 0.5,
  finish: 50,
  enterHome: 25,
  exitBase: 20,
  exitBaseSaturated: 8,
  landSafe: 12,
  escapeThreat: 18,
  dangerPerThreat: -8,
  progress: 0.3,
  jitter: 0.5,
};

/**
 * Forward distances (1..6) opponent tokens would need to land on my main-path cell.
 * A token that would enter its home column before reaching the cell is not a threat.
 */
function threatDistances(state: GameState, playerIdx: number, pos: number): number[] {
  if (pos < 0 || pos > LAST_MAIN_POS) return [];
  const me = state.players[playerIdx]!;
  const myAbs = absCell(me.color, pos);
  if (myAbs === null) return [];
  const out: number[] = [];
  state.players.forEach((p, pi) => {
    if (pi === playerIdx || p.finishedRank > 0) return;
    p.tokens.forEach((tp) => {
      if (tp < 0 || tp > LAST_MAIN_POS) return;
      const theirAbs = absCell(p.color, tp);
      if (theirAbs === null) return;
      const d = (myAbs - theirAbs + 52) % 52;
      if (d >= 1 && d <= 6 && tp + d <= LAST_MAIN_POS) out.push(d);
    });
  });
  return out;
}

function weightedThreat(distances: number[]): number {
  return distances.reduce((sum, d) => sum + (7 - d) / 6, 0);
}

export function scoreMove(
  state: GameState,
  move: Move,
  w: ScoreWeights = DEFAULT_WEIGHTS,
  rng?: () => number
): number {
  const playerIdx = state.current;
  const me = state.players[playerIdx]!;
  let s = 0;

  if (move.captures.length > 0) {
    s += w.capture * move.captures.length;
    s += move.captures.reduce((sum, c) => sum + c.fromPos * w.captureVictimProgress, 0);
  }
  if (move.isFinish) s += w.finish;
  if (move.entersHome) s += w.enterHome;
  if (move.isExitBase) {
    const tokensOut = me.tokens.filter((t) => t >= 0 && t < 56).length;
    s += tokensOut >= 2 ? w.exitBaseSaturated : w.exitBase;
  }

  const destAbs = move.to <= LAST_MAIN_POS ? absCell(me.color, move.to) : null;
  const destSafe = destAbs !== null && SAFE_CELLS.has(destAbs);
  if (destSafe) s += w.landSafe;

  const fromThreats = threatDistances(state, playerIdx, move.from);
  const toThreats = destSafe || destAbs === null ? [] : threatDistances(state, playerIdx, move.to);
  if (fromThreats.length > 0 && toThreats.length === 0) s += w.escapeThreat;
  s += w.dangerPerThreat * weightedThreat(toThreats);

  s += move.to * w.progress;
  if (rng) s += (rng() * 2 - 1) * w.jitter;
  return s;
}

export interface RankedMove {
  move: Move;
  score: number;
}

export function rankMoves(
  state: GameState,
  moves: Move[],
  w: ScoreWeights = DEFAULT_WEIGHTS,
  rng?: () => number
): RankedMove[] {
  return moves
    .map((move) => ({ move, score: scoreMove(state, move, w, rng) }))
    .sort((a, b) => b.score - a.score);
}

/** Best move, no randomness. Used when the turn timer moves for a player. */
export function pickBestMove(state: GameState, moves: Move[]): Move {
  if (moves.length === 0) throw new Error('no moves to pick from');
  return rankMoves(state, moves)[0]!.move;
}
