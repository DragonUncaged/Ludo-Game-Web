import { rankMoves } from './scorer.js';
import type { GameState, Move } from './types.js';

export type BotDifficulty = 'easy' | 'normal';

/**
 * normal: argmax with a little jitter (humanizes ties).
 * easy: softmax sample over the top 3 — makes visible mistakes.
 * rng: uniform [0,1) — inject a seeded PRNG in tests, Math.random-equivalent in prod.
 */
export function chooseBotMove(
  state: GameState,
  moves: Move[],
  difficulty: BotDifficulty,
  rng: () => number
): Move {
  if (moves.length === 0) throw new Error('no moves to choose from');
  const ranked = rankMoves(state, moves, undefined, rng);
  if (difficulty === 'normal') return ranked[0]!.move;

  const top = ranked.slice(0, 3);
  const temperature = 10;
  const weights = top.map((r) => Math.exp(r.score / temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < top.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return top[i]!.move;
  }
  return top[top.length - 1]!.move;
}
