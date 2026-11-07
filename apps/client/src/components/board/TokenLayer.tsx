import { memo } from 'react';
import { posToGrid } from '@ludo/engine';
import type { PlayerColor } from '@ludo/engine';
import type { GamePlayer, Poof, TokenOverride } from '../../store/gameStore';
import { COLOR_HEX } from './colors';
import { ClayCharacter } from './ClayCharacter';

const POOF_COLORS = ['#ff9a8b', '#9be3a8', '#8fc7ff', '#ffd97d', '#b98bff', '#ff8ab5', '#ffd97d', '#8fc7ff'];

interface Props {
  players: GamePlayer[];
  legalTokens: number[];
  mySeatIdx: number;
  currentPlayer: number;
  tokenStyle: 'clay' | '2d';
  overrides: Record<string, TokenOverride>;
  poofs: Poof[];
  onTapToken: (tokenIndex: number) => void;
}

/**
 * All 16 tokens, absolutely positioned over the board grid. Idle tokens render at
 * truePos (from the schema); tokens with an animation override render at the
 * override position — only the animation queue writes those.
 */
export const TokenLayer = memo(function TokenLayer({
  players,
  legalTokens,
  mySeatIdx,
  currentPlayer,
  tokenStyle,
  overrides,
  poofs,
  onTapToken,
}: Props) {
  // group idle tokens by cell to fan out stacks
  const byCell = new Map<string, { seat: number; token: number }[]>();
  players.forEach((p, seat) => {
    p.tokens.forEach((pos, token) => {
      if (overrides[`${seat}-${token}`]) return;
      const [r, c] = posToGrid(p.color as PlayerColor, pos, token);
      const key = `${r}:${c}`;
      if (!byCell.has(key)) byCell.set(key, []);
      byCell.get(key)!.push({ seat, token });
    });
  });

  return (
    <div className="pointer-events-none absolute inset-0">
      {players.map((p, seat) =>
        p.tokens.map((pos, token) => {
          const ovr = overrides[`${seat}-${token}`];
          let r: number, c: number;
          let dx = 0;
          let dy = 0;
          let scale = 1;
          if (ovr) {
            r = ovr.r;
            c = ovr.c;
          } else {
            [r, c] = posToGrid(p.color as PlayerColor, pos, token);
            const cluster = byCell.get(`${r}:${c}`)!;
            const n = cluster.length;
            if (n > 1) {
              const i = cluster.findIndex((e) => e.seat === seat && e.token === token);
              const angle = (i / n) * Math.PI * 2;
              dx = Math.cos(angle) * 0.22;
              dy = Math.sin(angle) * 0.22;
              scale = 0.72;
            }
          }
          const legal = !ovr && seat === mySeatIdx && seat === currentPlayer && legalTokens.includes(token);
          const anim = ovr?.anim;
          return (
            <button
              key={`${seat}-${token}`}
              onClick={() => legal && onTapToken(token)}
              className="absolute border-0 bg-transparent p-0"
              style={{
                left: `${((c + dx - 0.5) / 15) * 100}%`,
                top: `${((r + dy - 0.5) / 15) * 100}%`,
                width: '8%',
                height: '11%',
                willChange: 'left, top',
                ['--tk-scale' as string]: scale,
                transform: `translate(-50%, -72%) scale(${scale})`,
                transition:
                  anim === 'hop'
                    ? 'left .11s linear, top .11s linear'
                    : anim === 'fly'
                      ? 'none'
                      : 'left .28s ease, top .28s ease, transform .2s ease, filter .2s ease',
                animation:
                  anim === 'hop'
                    ? 'token-hop 0.24s ease-in-out infinite'
                    : anim === 'fly'
                      ? 'capture-fly 0.55s ease forwards'
                      : legal
                        ? 'clay-bob 0.8s ease-in-out infinite'
                        : 'none',
                zIndex: anim ? 9 : legal ? 8 : pos === -1 ? 3 : 5,
                pointerEvents: legal ? 'auto' : 'none',
                cursor: legal ? 'pointer' : 'default',
                filter: legal
                  ? `drop-shadow(0 0 6px ${COLOR_HEX[p.color]}) drop-shadow(0 4px 4px rgba(0,0,0,.3))`
                  : 'none',
              }}
              aria-label={legal ? `Move ${p.color} token ${token + 1}` : undefined}
            >
              <ClayCharacter color={COLOR_HEX[p.color] ?? '#999'} mode={tokenStyle} bob={false} />
            </button>
          );
        })
      )}

      {/* capture poofs */}
      {poofs.map((poof) => (
        <div
          key={poof.id}
          className="absolute h-0 w-0"
          style={{
            left: `${((poof.c - 0.5) / 15) * 100}%`,
            top: `${((poof.r - 0.5) / 15) * 100}%`,
            zIndex: 10,
          }}
        >
          {POOF_COLORS.map((col, i) => {
            const a = (i * Math.PI) / 4;
            return (
              <span
                key={i}
                className="absolute rounded-full"
                style={{
                  left: -5,
                  top: -5,
                  width: 10,
                  height: 10,
                  background: col,
                  ['--tx' as string]: `${Math.round(Math.cos(a) * 30)}px`,
                  ['--ty' as string]: `${Math.round(Math.sin(a) * 30)}px`,
                  animation: 'poof-part 0.6s ease-out forwards',
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
});
