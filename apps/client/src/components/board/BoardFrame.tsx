import { memo } from 'react';
import {
  BASE_SLOTS,
  HOME_GRID,
  PATH_GRID,
  SAFE_CELLS,
  START_OFFSET,
  TURN_ORDER,
} from '@ludo/engine';
import type { PlayerColor } from '@ludo/engine';
import { COLOR_HEX, shade } from './colors';

interface Props {
  dark: boolean;
  activeColor: string | null;
  seatColors: string[];
}

const BASE_QUADRANT: Record<PlayerColor, { gc: string; gr: string }> = {
  red: { gc: '1 / 7', gr: '1 / 7' },
  green: { gc: '10 / 16', gr: '1 / 7' },
  blue: { gc: '1 / 7', gr: '10 / 16' },
  yellow: { gc: '10 / 16', gr: '10 / 16' },
};

/** Static board: path cells, home columns, bases, center. Tokens render in TokenLayer above. */
export const BoardFrame = memo(function BoardFrame({ dark, activeColor, seatColors }: Props) {
  const cellBg = dark ? '#464267' : '#ffffff';
  const laneOf = new Map<number, string>();
  for (const color of TURN_ORDER) {
    laneOf.set(START_OFFSET[color], COLOR_HEX[color]!);
  }

  return (
    <div
      className="relative grid h-full w-full"
      style={{ gridTemplateColumns: 'repeat(15, 1fr)', gridTemplateRows: 'repeat(15, 1fr)', gap: 2 }}
    >
      {/* bases */}
      {TURN_ORDER.map((color) => {
        const q = BASE_QUADRANT[color];
        const hex = COLOR_HEX[color]!;
        const active = activeColor === color && seatColors.includes(color);
        return (
          <div
            key={color}
            className="transition-shadow duration-300"
            style={{
              gridColumn: q.gc,
              gridRow: q.gr,
              background: shade(hex, 0.1),
              borderRadius: '22%',
              padding: '11%',
              boxShadow: `inset -8px -9px 16px ${shade(hex, -0.2)}, inset 8px 8px 15px ${shade(hex, 0.34)}, 0 10px 18px rgba(0,0,0,.14)${
                active ? `, 0 0 0 5px rgba(255,255,255,.75), 0 0 26px 7px ${hex}` : ''
              }`,
            }}
          >
            <div
              className="h-full w-full"
              style={{
                background: dark ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.72)',
                borderRadius: '14%',
                boxShadow: 'inset 0 5px 10px rgba(0,0,0,.14)',
              }}
            />
          </div>
        );
      })}

      {/* center home */}
      <div
        className="relative overflow-hidden"
        style={{
          gridColumn: '7 / 10',
          gridRow: '7 / 10',
          borderRadius: '14%',
          boxShadow:
            'inset -6px -6px 12px rgba(0,0,0,.14), inset 6px 6px 12px rgba(255,255,255,.4), 0 8px 14px rgba(0,0,0,.16)',
        }}
      >
        <div className="absolute inset-0" style={{ background: COLOR_HEX.green, clipPath: 'polygon(0 0, 100% 0, 50% 50%)' }} />
        <div className="absolute inset-0" style={{ background: COLOR_HEX.yellow, clipPath: 'polygon(100% 0, 100% 100%, 50% 50%)' }} />
        <div className="absolute inset-0" style={{ background: COLOR_HEX.blue, clipPath: 'polygon(0 100%, 100% 100%, 50% 50%)' }} />
        <div className="absolute inset-0" style={{ background: COLOR_HEX.red, clipPath: 'polygon(0 0, 0 100%, 50% 50%)' }} />
        <div
          className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
          style={{
            width: '34%',
            aspectRatio: '1',
            background: dark ? '#34314f' : '#fdf6ec',
            boxShadow: 'inset -3px -3px 6px rgba(0,0,0,.18), 0 3px 6px rgba(0,0,0,.2)',
            fontSize: 14,
          }}
        >
          ★
        </div>
      </div>

      {/* main path */}
      {PATH_GRID.map(([r, c], idx) => {
        const lane = laneOf.get(idx);
        const star = SAFE_CELLS.has(idx) && !lane;
        return (
          <div
            key={`p${idx}`}
            className="clay-cell flex items-center justify-center"
            style={{ gridColumn: c, gridRow: r, background: lane ?? cellBg }}
          >
            {star && <span style={{ fontSize: 'min(1.4vh, 0.9vw)', color: 'rgba(90,80,110,.55)' }}>★</span>}
          </div>
        );
      })}

      {/* home columns */}
      {TURN_ORDER.map((color) =>
        HOME_GRID[color].map(([r, c], i) => (
          <div
            key={`h-${color}-${i}`}
            className="clay-cell"
            style={{ gridColumn: c, gridRow: r, background: COLOR_HEX[color] }}
          />
        ))
      )}

      {/* base slot pads (tokens land on these when captured) */}
      {TURN_ORDER.map((color) =>
        BASE_SLOTS[color].map(([r, c], i) => (
          <div
            key={`s-${color}-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${((c - 0.5) / 15) * 100}%`,
              top: `${((r - 0.5) / 15) * 100}%`,
              width: '7.5%',
              aspectRatio: '1',
              transform: 'translate(-50%, -50%)',
              background: dark ? 'rgba(0,0,0,.28)' : '#f1e8dc',
              boxShadow: 'inset -2px -2px 5px rgba(0,0,0,.13), inset 2px 2px 5px rgba(255,255,255,.32)',
            }}
          />
        ))
      )}
    </div>
  );
});
