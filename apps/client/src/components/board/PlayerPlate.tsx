import { memo, useEffect, useState } from 'react';
import type { GamePlayer } from '../../store/gameStore';
import { COLOR_HEX, shade } from './colors';

interface Props {
  player: GamePlayer;
  isCurrent: boolean;
  isMe: boolean;
  deadline: number;
  clockOffset: number;
  turnSeconds: number;
  dark: boolean;
}

export const PlayerPlate = memo(function PlayerPlate({
  player,
  isCurrent,
  isMe,
  deadline,
  clockOffset,
  turnSeconds,
  dark,
}: Props) {
  const [frac, setFrac] = useState(1);

  useEffect(() => {
    if (!isCurrent || !deadline) {
      setFrac(1);
      return;
    }
    let raf = 0;
    const tick = () => {
      const remaining = deadline - clockOffset - Date.now();
      setFrac(Math.max(0, Math.min(1, remaining / (turnSeconds * 1000))));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isCurrent, deadline, clockOffset, turnSeconds]);

  const hex = COLOR_HEX[player.color] ?? '#999';
  const urgent = isCurrent && frac < 0.25;
  const home = player.tokens.filter((t) => t === 56).length;

  return (
    <div
      className="clay flex items-center gap-2 px-3 py-2"
      style={{
        background: dark ? '#3c3959' : '#f4ede3',
        outline: isCurrent ? `3px solid ${hex}` : 'none',
        opacity: player.finishedRank > 0 ? 0.6 : 1,
        transition: 'outline-color .3s ease',
        minWidth: 0,
      }}
    >
      <div className="relative shrink-0" style={{ width: 34, height: 34 }}>
        <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={dark ? '#4a4667' : '#e7ded1'} strokeWidth="4" />
          {isCurrent && (
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={urgent ? '#ff6b6b' : hex}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${frac * 97.4} 97.4`}
            />
          )}
        </svg>
        <div
          className="absolute rounded-full"
          style={{
            inset: 5,
            background: hex,
            boxShadow: `inset -2px -2px 4px ${shade(hex, -0.2)}, inset 2px 2px 4px ${shade(hex, 0.3)}`,
          }}
        />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-extrabold" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
          <span className="truncate">
            {player.nickname}
            {isMe ? ' (you)' : ''}
          </span>
          {player.equippedCosmeticId && (
            <span className="shrink-0 text-lg">✨</span>
          )}
        </div>
        <div className="text-[11px] font-bold opacity-60" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
          {player.finishedRank > 0
            ? `#${player.finishedRank} 🏆`
            : `${home}/4 home${player.isBot ? ' · 🤖' : ''}${!player.connected && !player.isBot ? ' · ⚠︎ offline' : ''}`}
        </div>
      </div>
    </div>
  );
});
