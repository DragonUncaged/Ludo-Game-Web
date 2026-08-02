import { memo } from 'react';
import { shade } from './colors';

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

interface Props {
  value: number;
  rolling: boolean;
  canRoll: boolean;
  accent: string;
  onRoll: () => void;
}

export const Dice = memo(function Dice({ value, rolling, canRoll, accent, onRoll }: Props) {
  const on = PIPS[value] ?? [];
  return (
    <button
      onClick={() => canRoll && onRoll()}
      disabled={!canRoll}
      title={canRoll ? 'Tap to roll' : 'Waiting…'}
      className="border-0 bg-transparent p-0"
      style={{
        width: 72,
        height: 72,
        cursor: canRoll ? 'pointer' : 'default',
        animation: canRoll && !rolling ? 'clay-bob 1.6s ease-in-out infinite' : 'none',
        opacity: canRoll || rolling ? 1 : 0.55,
        transition: 'opacity .2s ease',
      }}
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: 'repeat(3, 1fr)',
          gridTemplateRows: 'repeat(3, 1fr)',
          padding: 13,
          gap: 2,
          borderRadius: 20,
          background: '#fbf7f0',
          boxShadow: 'inset -6px -7px 12px #d8cfc0, inset 6px 6px 11px #ffffff, 0 12px 20px rgba(0,0,0,.22)',
          animation: rolling ? 'dice-tumble .35s linear infinite' : 'none',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            className="place-self-center rounded-full"
            style={{
              width: 10,
              height: 10,
              background: on.includes(i) ? shade(accent, -0.12) : 'transparent',
              boxShadow: on.includes(i) ? 'inset -1px -1px 2px rgba(0,0,0,.3)' : 'none',
            }}
          />
        ))}
      </div>
    </button>
  );
});
