import { describe, expect, it } from 'vitest';
import {
  BASE_SLOTS,
  HOME_GRID,
  PATH_GRID,
  SAFE_CELLS,
  START_OFFSET,
  absCell,
  posToGrid,
  stepPath,
} from '../src/index.js';

describe('board geometry', () => {
  it('main path has 52 cells with the verified landmarks', () => {
    expect(PATH_GRID).toHaveLength(52);
    expect(PATH_GRID[0]).toEqual([7, 1]);
    expect(PATH_GRID[1]).toEqual([7, 2]); // red start
    expect(PATH_GRID[12]).toEqual([1, 8]); // green home entry
    expect(PATH_GRID[14]).toEqual([2, 9]); // green start
    expect(PATH_GRID[25]).toEqual([8, 15]); // yellow home entry
    expect(PATH_GRID[27]).toEqual([9, 14]); // yellow start
    expect(PATH_GRID[38]).toEqual([15, 8]); // blue home entry
    expect(PATH_GRID[40]).toEqual([14, 7]); // blue start
    expect(PATH_GRID[51]).toEqual([8, 1]); // red home entry
  });

  it('start offsets land on the start cells', () => {
    expect(PATH_GRID[START_OFFSET.red]).toEqual([7, 2]);
    expect(PATH_GRID[START_OFFSET.green]).toEqual([2, 9]);
    expect(PATH_GRID[START_OFFSET.yellow]).toEqual([9, 14]);
    expect(PATH_GRID[START_OFFSET.blue]).toEqual([14, 7]);
  });

  it('safe stars sit at the verified grid points', () => {
    expect(PATH_GRID[9]).toEqual([3, 7]);
    expect(PATH_GRID[22]).toEqual([7, 13]);
    expect(PATH_GRID[35]).toEqual([13, 9]);
    expect(PATH_GRID[48]).toEqual([9, 3]);
    expect(SAFE_CELLS.size).toBe(8);
  });

  it('every path cell is unique', () => {
    const seen = new Set(PATH_GRID.map(([r, c]) => `${r},${c}`));
    expect(seen.size).toBe(52);
  });

  it('the cell before each home entry is pos 50 for that color', () => {
    expect(absCell('red', 50)).toBe(51); // (8,1) is red's entry — abs 51 is the last shared cell red touches
    expect(absCell('green', 50)).toBe(12);
    expect(absCell('yellow', 50)).toBe(25);
    expect(absCell('blue', 50)).toBe(38);
  });

  it('posToGrid maps base, path, home, finish', () => {
    expect(posToGrid('red', -1, 0)).toEqual(BASE_SLOTS.red[0]);
    expect(posToGrid('red', 0, 0)).toEqual([7, 2]);
    expect(posToGrid('green', 0, 1)).toEqual([2, 9]);
    expect(posToGrid('red', 51, 0)).toEqual(HOME_GRID.red[0]);
    expect(posToGrid('blue', 55, 3)).toEqual(HOME_GRID.blue[4]);
    expect(posToGrid('yellow', 56, 2)).toEqual([8, 8.6]);
  });

  it('stepPath handles base exit and normal moves', () => {
    expect(stepPath(-1, 0)).toEqual([0]);
    expect(stepPath(3, 6)).toEqual([4, 5, 6]);
    expect(stepPath(50, 53)).toEqual([51, 52, 53]);
  });
});
