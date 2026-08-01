import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Room } from 'colyseus.js';
import { createRoom, joinRoomByCode, mapJoinError } from '../lib/colyseus';
import { useConnection } from '../store/connectionStore';
import { useSettings } from '../store/settingsStore';
import type { DiceMode } from '@ludo/shared';
import { ClayCharacter } from '../components/board/ClayCharacter';
import { COLOR_HEX } from '../components/board/colors';

function waitForJoinCode(room: Room): Promise<string> {
  return new Promise((resolve) => {
    const check = () => {
      const code = (room.state as { joinCode?: string })?.joinCode;
      if (code) return resolve(code);
      room.onStateChange.once(() => check());
    };
    check();
  });
}

export default function HomeScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const settings = useSettings();
  const connection = useConnection();
  const [code, setCode] = useState(params.get('join') ?? '');
  const [seats, setSeats] = useState<2 | 3 | 4>(4);
  const [diceMode, setDiceMode] = useState<DiceMode>('dynamic');
  const [turnSeconds, setTurnSeconds] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const identity = () => ({
    nickname: settings.nickname.trim() || 'Player',
    deviceToken: settings.deviceToken,
  });

  const requireNickname = (): boolean => {
    if (!settings.nickname.trim()) {
      setError('Pick a nickname first!');
      return false;
    }
    return true;
  };

  const onCreate = async () => {
    if (!requireNickname() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const room = await createRoom({ ...identity(), seats, diceMode, turnSeconds });
      connection.setRoom(room);
      const joinCode = await waitForJoinCode(room);
      navigate(`/room/${joinCode}`);
    } catch (err) {
      setError(mapJoinError(err));
    } finally {
      setBusy(false);
    }
  };

  const onJoin = async () => {
    if (!requireNickname() || busy || code.trim().length < 4) return;
    setBusy(true);
    setError(null);
    try {
      const room = await joinRoomByCode(code, identity());
      connection.setRoom(room);
      navigate(`/room/${code.trim().toUpperCase()}`);
    } catch (err) {
      setError(mapJoinError(err));
    } finally {
      setBusy(false);
    }
  };

  const pill = (active: boolean) =>
    `cursor-pointer rounded-xl px-3 py-2 text-sm font-extrabold transition-all ${
      active ? 'bg-clay-yellow text-[#7a5b18] clay-pressed' : 'bg-transparent opacity-50'
    }`;

  return (
    <div
      className="relative flex min-h-screen flex-col items-center overflow-hidden px-5 py-10"
      style={{ background: 'linear-gradient(160deg,#ffe9f0,#e9f1ff,#eafff2)' }}
    >
      <div className="pointer-events-none absolute -left-20 -top-28 h-[380px] w-[380px] rounded-full opacity-60 blur-[60px]" style={{ background: '#ffc7d9', animation: 'drift-a 14s ease-in-out infinite' }} />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full opacity-55 blur-[70px]" style={{ background: '#bfe0ff', animation: 'drift-b 17s ease-in-out infinite' }} />

      <header className="relative z-10 mb-8 flex items-end gap-3">
        <div style={{ width: 64, height: 80 }}>
          <ClayCharacter color={COLOR_HEX.red!} mode="clay" bob />
        </div>
        <h1 className="font-display text-5xl font-extrabold text-ink-light">Ludo Royale</h1>
        <div style={{ width: 64, height: 80 }}>
          <ClayCharacter color={COLOR_HEX.blue!} mode="clay" bob />
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md space-y-5">
        <div className="clay bg-board-light p-5">
          <label className="text-xs font-extrabold uppercase tracking-wide opacity-50">Your nickname</label>
          <input
            value={settings.nickname}
            onChange={(e) => settings.setNickname(e.target.value)}
            maxLength={20}
            placeholder="e.g. Ankit"
            className="clay-pressed mt-2 w-full rounded-2xl border-0 bg-seg-light px-4 py-3 font-body text-lg font-bold text-ink-light outline-none"
          />
        </div>

        <div className="clay bg-board-light p-5">
          <div className="mb-3 font-display text-xl font-extrabold text-ink-light">Create a room</div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold opacity-60">Players</span>
            <div className="clay-pressed flex gap-1 rounded-2xl bg-seg-light p-1">
              {([2, 3, 4] as const).map((n) => (
                <button key={n} className={pill(seats === n)} onClick={() => setSeats(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-bold opacity-60">Dice</span>
            <div className="clay-pressed flex gap-1 rounded-2xl bg-seg-light p-1">
              <button className={pill(diceMode === 'dynamic')} onClick={() => setDiceMode('dynamic')}>✨ Exciting</button>
              <button className={pill(diceMode === 'fair')} onClick={() => setDiceMode('fair')}>⚖️ Fair</button>
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-bold opacity-60">Turn timer</span>
            <div className="clay-pressed flex gap-1 rounded-2xl bg-seg-light p-1">
              {[10, 20, 30].map((n) => (
                <button key={n} className={pill(turnSeconds === n)} onClick={() => setTurnSeconds(n)}>{n}s</button>
              ))}
            </div>
          </div>
          <button
            onClick={onCreate}
            disabled={busy}
            className="clay w-full cursor-pointer rounded-2xl border-0 bg-clay-yellow py-3.5 font-body text-lg font-extrabold text-[#7a5b18] active:clay-pressed disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create room'}
          </button>
          <p className="mt-2 text-center text-xs font-bold opacity-40">Empty seats are filled with bots when you start</p>
        </div>

        <div className="clay bg-board-light p-5">
          <div className="mb-3 font-display text-xl font-extrabold text-ink-light">Join with a code</div>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && onJoin()}
              maxLength={6}
              placeholder="ABC123"
              className="clay-pressed w-full rounded-2xl border-0 bg-seg-light px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[0.3em] text-ink-light outline-none"
            />
            <button
              onClick={onJoin}
              disabled={busy || code.trim().length < 4}
              className="clay cursor-pointer rounded-2xl border-0 bg-clay-green px-6 font-body text-lg font-extrabold text-[#2c6b3d] disabled:opacity-50"
            >
              Join
            </button>
          </div>
        </div>

        {error && (
          <div className="clay bg-clay-red/90 px-4 py-3 text-center font-bold text-white">{error}</div>
        )}
      </div>
    </div>
  );
}
