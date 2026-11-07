import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useConnection } from '../store/connectionStore';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';
import { clearReconnectToken } from '../lib/colyseus';
import { ClayCharacter } from '../components/board/ClayCharacter';
import { COLOR_HEX } from '../components/board/colors';
import { BettingSetupPanel } from '../components/betting/BettingSetupPanel';
import { useCoinBalance } from '../hooks/useCoinBalance';
import { TURN_ORDER } from '@ludo/engine';

export default function LobbyView() {
  const navigate = useNavigate();
  const { room } = useConnection();
  const { snap, mySessionId } = useGame();
  const settings = useSettings();
  const { balance: myBalance, loading: balanceLoading } = useCoinBalance(settings.deviceToken);
  const [notice, setNotice] = useState<string | null>(null);

  // Surface server-side rejections (e.g. "All players must accept the bet to start").
  useEffect(() => {
    if (!room) return;
    let active = true;
    const unbind = room.onMessage<{ message?: string }>('error', (msg) => {
      if (!msg?.message) return;
      setNotice(msg.message);
      setTimeout(() => active && setNotice(null), 3000);
    });
    return () => {
      active = false;
      unbind();
    };
  }, [room]);

  if (!snap || !room) return null;

  const isHost = snap.hostSessionId === mySessionId;
  const seatsMax = 4;
  const previewColors = TURN_ORDER;

  const leave = () => {
    clearReconnectToken();
    room.leave(true);
    navigate('/');
  };

  const handleBetAmountChange = (amount: number) => {
    if (isHost) {
      room.send('setBetAmount', { betAmount: amount });
    }
  };

  const handleAcceptBet = () => {
    room.send('acceptBet', { accepted: true });
  };

  const handleDeclineBet = () => {
    room.send('declineBet');
  };

  return (
    <div className="relative z-10 w-full max-w-md space-y-5">
      <div className="clay bg-board-light p-6 text-center">
        <div className="text-xs font-extrabold uppercase tracking-wide opacity-50">
          Room code — share with friends
        </div>
        <div className="mt-2 font-display text-5xl font-extrabold tracking-[0.25em] text-ink-light">
          {snap.joinCode}
        </div>
        <div className="mt-1 text-xs font-bold opacity-40">
          {snap.diceMode === 'dynamic' ? '✨ Exciting dice' : '⚖️ Fair dice'} · {snap.turnSeconds}s turns
        </div>
      </div>

      <div className="clay bg-board-light p-5">
        <div className="mb-3 font-display text-xl font-extrabold text-ink-light">
          Players ({snap.players.length}/{seatsMax})
        </div>
        <div className="space-y-2">
          {snap.players.map((p, i) => (
            <div
              key={p.sessionId}
              className="clay-pressed flex items-center gap-3 rounded-2xl bg-seg-light px-3 py-2"
            >
              <div style={{ width: 34, height: 42 }}>
                <ClayCharacter color={COLOR_HEX[previewColors[i]!]!} mode="clay" bob={i === 0} />
              </div>
              <div className="font-extrabold text-ink-light">
                {p.nickname}
                {p.sessionId === mySessionId ? ' (you)' : ''}
              </div>
              {p.sessionId === snap.hostSessionId && <span className="ml-auto text-sm">👑 host</span>}
            </div>
          ))}
          {snap.players.length < seatsMax && (
            <div className="rounded-2xl border-2 border-dashed border-ink-light/20 px-3 py-3 text-center text-sm font-bold opacity-40">
              empty seats become bots 🤖
            </div>
          )}
        </div>
      </div>

      {/* Hosts can always adjust the wager before start; others see it while pending. */}
      {(isHost || snap.bettingStatus !== 'accepted') && (
        <BettingSetupPanel
          snap={snap}
          isHost={isHost}
          mySessionId={mySessionId}
          myBalance={myBalance}
          balanceLoading={balanceLoading}
          onBetAmountChange={handleBetAmountChange}
          onAcceptBet={handleAcceptBet}
          onDeclineBet={handleDeclineBet}
        />
      )}

      {notice && (
        <div className="clay bg-clay-red/90 px-4 py-3 text-center text-sm font-extrabold text-white">
          {notice}
        </div>
      )}

      {isHost ? (
        <button
          onClick={() => room.send('startGame')}
          className="clay w-full cursor-pointer rounded-2xl border-0 bg-clay-green py-4 font-body text-xl font-extrabold text-[#2c6b3d]"
        >
          Start game ▶
        </button>
      ) : (
        <div className="clay bg-board-light py-4 text-center font-bold opacity-60">
          Waiting for the host to start…
        </div>
      )}

      <button
        onClick={leave}
        className="w-full cursor-pointer border-0 bg-transparent py-2 font-bold text-ink-light opacity-50"
      >
        ← Leave room
      </button>
    </div>
  );
}
