import type { GameState } from './types.js';

export function serializeGame(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeGame(json: string): GameState {
  const s = JSON.parse(json) as GameState;
  if (!Array.isArray(s.players) || typeof s.current !== 'number' || !s.phase) {
    throw new Error('invalid serialized game state');
  }
  return s;
}
