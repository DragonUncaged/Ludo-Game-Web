import type { PlayerColor } from './types.js';

export type GridPoint = readonly [row: number, col: number];

/**
 * The 52-cell main path on the 15×15 board, clockwise from (7,1).
 * Geometry verified against the design mock.
 */
export const PATH_GRID: readonly GridPoint[] = (() => {
  const p: GridPoint[] = [];
  for (let c = 1; c <= 6; c++) p.push([7, c]); //  0- 5
  for (let r = 6; r >= 1; r--) p.push([r, 7]); //  6-11
  p.push([1, 8], [1, 9]); // 12-13
  for (let r = 2; r <= 6; r++) p.push([r, 9]); // 14-18
  for (let c = 10; c <= 15; c++) p.push([7, c]); // 19-24
  p.push([8, 15], [9, 15]); // 25-26
  for (let c = 14; c >= 10; c--) p.push([9, c]); // 27-31
  for (let r = 10; r <= 15; r++) p.push([r, 9]); // 32-37
  p.push([15, 8], [15, 7]); // 38-39
  for (let r = 14; r >= 10; r--) p.push([r, 7]); // 40-44
  for (let c = 6; c >= 1; c--) p.push([9, c]); // 45-50
  p.push([8, 1]); // 51
  return p;
})();

/** Absolute path index of each color's start cell. */
export const START_OFFSET: Record<PlayerColor, number> = {
  red: 1,
  green: 14,
  yellow: 27,
  blue: 40,
};

/** Start cells + the four star cells. No captures here; tokens co-exist. */
export const SAFE_CELLS: ReadonlySet<number> = new Set([1, 14, 27, 40, 9, 22, 35, 48]);

/** Home-column cells per color, in entry order (pos 51..55). */
// prettier-ignore
export const HOME_GRID: Record<PlayerColor, readonly GridPoint[]> = {
  red: [[8, 2], [8, 3], [8, 4], [8, 5], [8, 6]],
  green: [[2, 8], [3, 8], [4, 8], [5, 8], [6, 8]],
  yellow: [[8, 14], [8, 13], [8, 12], [8, 11], [8, 10]],
  blue: [[14, 8], [13, 8], [12, 8], [11, 8], [10, 8]],
};

/** Resting spot inside the center for finished tokens (pos 56), facing the color's triangle. */
export const CENTER_TARGET: Record<PlayerColor, GridPoint> = {
  red: [8, 7.4],
  green: [7.4, 8],
  yellow: [8, 8.6],
  blue: [8.6, 8],
};

/** Base slot centers per color, one per token index (continuous cell coordinates). */
// prettier-ignore
export const BASE_SLOTS: Record<PlayerColor, readonly GridPoint[]> = {
  red: [[2.5, 2.5], [2.5, 4.5], [4.5, 2.5], [4.5, 4.5]],
  green: [[2.5, 11.5], [2.5, 13.5], [4.5, 11.5], [4.5, 13.5]],
  blue: [[11.5, 2.5], [11.5, 4.5], [13.5, 2.5], [13.5, 4.5]],
  yellow: [[11.5, 11.5], [11.5, 13.5], [13.5, 11.5], [13.5, 13.5]],
};

/** Canonical clockwise turn order. */
export const TURN_ORDER: readonly PlayerColor[] = ['red', 'green', 'yellow', 'blue'];
