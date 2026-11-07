import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { joinRoomByCode, mapJoinError, tryReconnect } from '../lib/colyseus';
import { useConnection } from '../store/connectionStore';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';
import { useRoomEvents } from '../hooks/useRoomEvents';
import LobbyView from './LobbyView';
import GameScreen from './GameScreen';
import SummaryScreen from './SummaryScreen';

export default function RoomScreen() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const connection = useConnection();
  const settings = useSettings();
  const { snap, ranking, reset } = useGame();
  const [error, setError] = useState<string | null>(null);
  const joining = useRef(false);
  const dark = settings.theme === 'dark';

  useRoomEvents(connection.room);

  // Direct URL visit / refresh: try reconnect first, then a fresh join by code.
  useEffect(() => {
    if (connection.room || joining.current || !code) return;
    if (!settings.nickname.trim()) {
      navigate(`/?join=${code}`);
      return;
    }
    joining.current = true;
    (async () => {
      try {
        const reconnected = await tryReconnect();
        if (reconnected) {
          connection.setRoom(reconnected);
          return;
        }
        const room = await joinRoomByCode(code, {
          nickname: settings.nickname.trim(),
          deviceToken: settings.deviceToken,
        });
        connection.setRoom(room);
      } catch (err) {
        setError(mapJoinError(err));
      } finally {
        joining.current = false;
      }
    })();
  }, [code, connection.room]);

  // Clear game store when leaving the room screen entirely.
  useEffect(() => () => reset(), []);

  const phase = ranking ? 'ended' : snap?.roomPhase;

  return (
    <div className={dark ? 'dark' : ''}>
      <div
        className="relative flex min-h-screen flex-col items-center overflow-hidden px-4 py-6 transition-colors duration-500"
        style={{
          background: dark
            ? 'linear-gradient(160deg,#2b2743,#20223a,#241f36)'
            : 'linear-gradient(160deg,#ffe9f0,#e9f1ff,#eafff2)',
        }}
      >
        <div className="pointer-events-none absolute -left-20 -top-28 h-[380px] w-[380px] rounded-full opacity-60 blur-[60px]" style={{ background: dark ? '#4b3f6e' : '#ffc7d9', animation: 'drift-a 14s ease-in-out infinite' }} />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full opacity-55 blur-[70px]" style={{ background: dark ? '#3a5a72' : '#bfe0ff', animation: 'drift-b 17s ease-in-out infinite' }} />

        {error ? (
          <div className="relative z-10 mt-24 w-full max-w-sm space-y-4 text-center">
            <div className="clay bg-clay-red/90 px-4 py-3 font-bold text-white">{error}</div>
            <button onClick={() => navigate('/')} className="clay cursor-pointer rounded-2xl border-0 bg-board-light px-6 py-3 font-extrabold text-ink-light">
              ← Back home
            </button>
          </div>
        ) : !snap ? (
          <div className="relative z-10 mt-24 font-display text-2xl font-extrabold" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
            Joining room…
          </div>
        ) : phase === 'waiting' ? (
          <LobbyView />
        ) : phase === 'ended' ? (
          <SummaryScreen />
        ) : (
          <GameScreen />
        )}
      </div>
    </div>
  );
}
