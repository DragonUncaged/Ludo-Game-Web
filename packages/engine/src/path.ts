import { BASE_SLOTS, CENTER_TARGET, HOME_GRID, PATH_GRID, START_OFFSET } from './constants.js';
import type { GridPoint } from './constants.js';
import { LAST_MAIN_POS, POS_BASE, POS_FINISHED } from './types.js';
import type { PlayerColor, TokenPos } from './types.js';

/** Absolute main-path cell index for a relative pos, or null when off the main path. */
export function absCell(color: PlayerColor, pos: TokenPos): number | null {
  if (pos < 0 || pos > LAST_MAIN_POS) return null;
  return (START_OFFSET[color] + pos) % 52;
}

/**
 * Continuous board coordinates for a token. The center of grid cell (r, c) is (r, c);
 * clients convert with left = (col - 0.5) / 15, top = (row - 0.5) / 15.
 */
export function posToGrid(color: PlayerColor, pos: TokenPos, tokenIndex: number): GridPoint {
  if (pos === POS_BASE) {
    const slot = BASE_SLOTS[color][tokenIndex];
    if (!slot) throw new Error(`bad token index ${tokenIndex}`);
    return slot;
  }
  if (pos === POS_FINISHED) return CENTER_TARGET[color];
  if (pos > LAST_MAIN_POS) {
    const cell = HOME_GRID[color][pos - 51];
    if (!cell) throw new Error(`bad home pos ${pos}`);
    return cell;
  }
  const abs = absCell(color, pos);
  const cell = abs === null ? undefined : PATH_GRID[abs];
  if (!cell) throw new Error(`bad pos ${pos}`);
  return cell;
}

/** Inclusive list of intermediate positions for an animation, from exclusive → to inclusive. */
export function stepPath(from: TokenPos, to: TokenPos): TokenPos[] {
  if (from === POS_BASE) return [0];
  const steps: TokenPos[] = [];
  for (let p = from + 1; p <= to; p++) steps.push(p);
  return steps;
}
