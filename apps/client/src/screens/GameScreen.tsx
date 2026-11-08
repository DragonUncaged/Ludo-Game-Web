import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useConnection } from '../store/connectionStore';
import { mySeat, useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';
import { clearReconnectToken } from '../lib/colyseus';
import { useAnimationQueue } from '../hooks/useAnimationQueue';
import { BoardFrame } from '../components/board/BoardFrame';
import { TokenLayer } from '../components/board/TokenLayer';
import { Dice } from '../components/board/Dice';
import { PlayerPlate } from '../components/board/PlayerPlate';
import { COLOR_HEX } from '../components/board/colors';

export default function GameScreen() {
  const navigate = useNavigate();
  const { room } = useConnection();
  const gameState = useGame();
  const settings = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { snap, legalTokens, clockOffset, shownDice, rolling, overrides, poofs } = gameState;
  const seat = mySeat(gameState);
  const dark = settings.theme === 'dark';

  useAnimationQueue(room);

  // Toast when someone has no legal move or throws a third six.
  useEffect(() => {
    if (!room) return;
    let active = true;
    let lastSeq = 0;
    const unbind = room.onMessage<{ seq?: number; seat: number; autoPass: boolean; forfeit: boolean }>(
      'diceRolled',
      ({ seq, seat: s, autoPass, forfeit }) => {
        if (!autoPass && !forfeit) return;
        if (seq && seq <= lastSeq) return;
        if (seq) lastSeq = seq;
        const who = useGame.getState().snap?.players[s]?.nickname ?? '…';
        setToast(forfeit ? `${who} rolled three 6s — turn lost! 😵` : `${who} has no moves — passing`);
        setTimeout(() => active && setToast(null), 1800);
      }
    );
    return () => {
      active = false;
      unbind();
    };
  }, [room]);

  // Tell me when the turn timer played my move for me.
  useEffect(() => {
    if (!room) return;
    let active = true;
    let lastSeq = 0;
    const unbind = room.onMessage<{ seq?: number; seat: number; auto?: boolean }>('moveApplied', (msg) => {
      if (!msg.auto) return;
      if (msg.seq && msg.seq <= lastSeq) return;
      if (msg.seq) lastSeq = msg.seq;
      const g = useGame.getState();
      const me = g.snap?.players.findIndex((p) => p.sessionId === g.mySessionId) ?? -1;
      if (msg.seat === me) {
        setToast("⏱ Time's up — we played your best move");
        setTimeout(() => active && setToast(null), 2200);
      }
    });
    return () => {
      active = false;
      unbind();
    };
  }, [room]);

  if (!snap || !room) return null;

  const current = snap.players[snap.currentPlayer];
  const isMyTurn = seat >= 0 && seat === snap.currentPlayer;
  const canRoll = isMyTurn && snap.turnPhase === 'awaitRoll' && snap.roomPhase === 'playing';
  const accent = COLOR_HEX[current?.color ?? 'red'] ?? '#ff9a8b';

  const roll = () => {
    gameState.setRolling(true);
    room.send('roll');
  };

  const leave = () => {
    clearReconnectToken();
    room.leave(true);
    navigate('/');
  };

  const pill = (active: boolean) =>
    `cursor-pointer rounded-xl px-3 py-2 text-sm font-extrabold transition-all ${
      active ? 'bg-clay-yellow text-[#7a5b18] clay-pressed' : 'bg-transparent opacity-50'
    }`;

  return (
    <div
      className="relative z-10 flex w-full flex-col items-center"
      style={{ maxWidth: 'min(680px, 94vmin)' }}
    >
      <header className="mb-3 flex w-full items-center justify-between gap-3">
        <div
          className="clay flex items-center gap-2.5 py-1.5 pl-2 pr-4"
          style={{ background: dark ? '#3c3959' : '#f4ede3' }}
        >
          <div
            className="h-8 w-8 rounded-xl transition-colors duration-300"
            style={{
              background: accent,
              boxShadow: 'inset -3px -3px 5px rgba(0,0,0,.2), inset 3px 3px 5px rgba(255,255,255,.4)',
            }}
          />
          <span
            className="whitespace-nowrap font-display text-base font-extrabold"
            style={{ color: dark ? '#f3eefe' : '#4a4258' }}
          >
            {snap.roomPhase === 'ended'
              ? 'Game over!'
              : isMyTurn
                ? 'Your turn!'
                : `${current?.nickname ?? '…'}'s turn`}
          </span>
        </div>
        <button
          onClick={() => setSettingsOpen((o) => !o)}
          className="clay h-12 w-12 cursor-pointer border-0 text-xl"
          style={{ background: dark ? '#3c3959' : '#f4ede3' }}
        >
          ⚙️
        </button>
      </header>

      {settingsOpen && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setSettingsOpen(false)} />
          <div
            className="clay absolute right-0 top-14 z-30 w-72 p-5"
            style={{ background: dark ? '#34314f' : '#fdf6ec', color: dark ? '#f3eefe' : '#4a4258' }}
          >
            <div className="mb-3 font-display text-lg font-extrabold">Settings</div>
            <div className="mb-1 text-xs font-extrabold uppercase tracking-wide opacity-50">Board mode</div>
            <div
              className="clay-pressed mb-3 flex gap-1 rounded-2xl p-1"
              style={{ background: dark ? '#3c3959' : '#f4ede3' }}
            >
              <button
                className={pill(settings.tokenStyle === 'clay')}
                onClick={() => settings.setTokenStyle('clay')}
              >
                Clay pals
              </button>
              <button
                className={pill(settings.tokenStyle === '2d')}
                onClick={() => settings.setTokenStyle('2d')}
              >
                2D tokens
              </button>
            </div>
            <div className="mb-1 text-xs font-extrabold uppercase tracking-wide opacity-50">Theme</div>
            <div
              className="clay-pressed mb-3 flex gap-1 rounded-2xl p-1"
              style={{ background: dark ? '#3c3959' : '#f4ede3' }}
            >
              <button className={pill(!dark)} onClick={() => settings.setTheme('light')}>
                ☀️ Light
              </button>
              <button className={pill(dark)} onClick={() => settings.setTheme('dark')}>
                🌙 Dark
              </button>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold">Sound</span>
              <button
                className={pill(settings.soundOn)}
                onClick={() => settings.setSoundOn(!settings.soundOn)}
              >
                {settings.soundOn ? 'On' : 'Off'}
              </button>
            </div>
            <div className="mb-3 text-xs font-bold opacity-50">
              Dice: {snap.diceMode === 'dynamic' ? '✨ Exciting (casual pacing)' : '⚖️ Fair'}
            </div>
            <button
              onClick={leave}
              className="w-full cursor-pointer rounded-xl border-0 bg-clay-red py-2.5 font-extrabold text-white"
            >
              Leave game
            </button>
          </div>
        </>
      )}

      <div className="mb-3 grid w-full grid-cols-2 gap-2">
        {snap.players.map((p, i) => (
          <PlayerPlate
            key={p.sessionId}
            player={p}
            isCurrent={i === snap.currentPlayer && snap.roomPhase === 'playing'}
            isMe={i === seat}
            deadline={snap.turnDeadline}
            clockOffset={clockOffset}
            turnSeconds={snap.turnSeconds}
            dark={dark}
          />
        ))}
      </div>

      <div className="relative w-full">
        <div
          className="clay aspect-square w-full p-3.5 transition-colors duration-300"
          style={{ background: dark ? '#34314f' : '#fdf6ec', borderRadius: 34 }}
        >
          <div className="relative h-full w-full">
            <BoardFrame
              dark={dark}
              activeColor={current?.color ?? null}
              seatColors={snap.players.map((p) => p.color)}
            />
            <TokenLayer
              players={snap.players}
              legalTokens={legalTokens}
              mySeatIdx={seat}
              currentPlayer={snap.currentPlayer}
              tokenStyle={settings.tokenStyle}
              overrides={overrides}
              poofs={poofs}
              onTapToken={(tokenIndex) => room.send('move', { tokenIndex })}
            />
          </div>
        </div>

        <div className="absolute -bottom-6 -right-2 z-10">
          <Dice
            value={shownDice || snap.dice || 5}
            rolling={rolling}
            canRoll={canRoll}
            accent={accent}
            onRoll={roll}
          />
        </div>
      </div>

      <div className="mt-8 h-8 text-center">
        {toast ? (
          <span className="clay bg-board-light px-4 py-1.5 text-sm font-extrabold text-ink-light">
            {toast}
          </span>
        ) : canRoll ? (
          <span className="text-sm font-extrabold opacity-60" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
            🎲 Tap the dice to roll!
          </span>
        ) : isMyTurn && legalTokens.length > 0 ? (
          <span className="text-sm font-extrabold opacity-60" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
            👆 Tap a glowing character to move
          </span>
        ) : null}
      </div>
    </div>
  );
}
