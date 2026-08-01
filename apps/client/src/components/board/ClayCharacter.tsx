import { memo } from 'react';
import { shade } from './colors';

interface Props {
  color: string;
  mode: 'clay' | '2d';
  bob?: boolean;
}

/** The claymorphism character from the design — pure CSS, color-parameterized. */
export const ClayCharacter = memo(function ClayCharacter({ color, mode, bob = false }: Props) {
  const dark = shade(color, -0.22);
  const light = shade(color, 0.3);

  if (mode === '2d') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: '80%',
            aspectRatio: '1',
            background: color,
            boxShadow: `inset -5px -6px 10px ${dark}, inset 5px 5px 9px ${light}, 0 7px 11px rgba(0,0,0,.22)`,
          }}
        >
          <div
            className="rounded-full"
            style={{
              width: '44%',
              aspectRatio: '1',
              background: light,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,.18), 0 1px 1px rgba(255,255,255,.6)',
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* ground shadow */}
      <div
        className="absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{ bottom: '2%', width: '46%', height: '8%', background: 'rgba(30,20,40,.24)', filter: 'blur(1px)' }}
      />
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          bottom: '6%',
          width: '100%',
          height: '88%',
          transformOrigin: 'center bottom',
          animation: bob ? 'clay-bob 2.6s ease-in-out infinite' : 'none',
        }}
      >
        {/* feet */}
        <div className="absolute bottom-0" style={{ left: '24%', width: '20%', height: '15%', borderRadius: '50% 50% 45% 45%', background: dark, boxShadow: 'inset -2px -2px 4px rgba(0,0,0,.25)' }} />
        <div className="absolute bottom-0" style={{ right: '24%', width: '20%', height: '15%', borderRadius: '50% 50% 45% 45%', background: dark, boxShadow: 'inset -2px -2px 4px rgba(0,0,0,.25)' }} />
        {/* body */}
        <div
          className="absolute"
          style={{
            bottom: '9%',
            left: '6%',
            width: '88%',
            height: '82%',
            borderRadius: '47% 47% 42% 42%',
            background: color,
            boxShadow: `inset -9px -11px 18px ${dark}, inset 9px 9px 15px ${light}, 0 9px 15px rgba(0,0,0,.22)`,
          }}
        >
          {/* sheen */}
          <div className="absolute rounded-full" style={{ top: '8%', left: '14%', width: '34%', height: '20%', background: light, opacity: 0.55, filter: 'blur(1px)', transform: 'rotate(-18deg)' }} />
          {/* eyes */}
          <div className="absolute flex items-center justify-end rounded-full" style={{ top: '30%', left: '20%', width: '23%', aspectRatio: '1', background: '#fff', boxShadow: 'inset -2px -2px 3px rgba(0,0,0,.14)' }}>
            <div className="rounded-full" style={{ width: '52%', aspectRatio: '1', marginRight: '14%', background: '#33313f' }} />
          </div>
          <div className="absolute flex items-center justify-start rounded-full" style={{ top: '30%', right: '20%', width: '23%', aspectRatio: '1', background: '#fff', boxShadow: 'inset -2px -2px 3px rgba(0,0,0,.14)' }}>
            <div className="rounded-full" style={{ width: '52%', aspectRatio: '1', marginLeft: '14%', background: '#33313f' }} />
          </div>
          {/* cheeks */}
          <div className="absolute rounded-full" style={{ top: '60%', left: '18%', width: '16%', height: '9%', background: dark, opacity: 0.5 }} />
          <div className="absolute rounded-full" style={{ top: '60%', right: '18%', width: '16%', height: '9%', background: dark, opacity: 0.5 }} />
          {/* mouth */}
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '64%', width: '30%', height: '16%', borderRadius: '0 0 60px 60px', background: '#33313f', opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
});
