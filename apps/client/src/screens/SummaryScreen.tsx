import { useNavigate } from 'react-router';
import { useConnection } from '../store/connectionStore';
import { useGame } from '../store/gameStore';
import { useSettings } from '../store/settingsStore';
import { clearReconnectToken } from '../lib/colyseus';
import { ClayCharacter } from '../components/board/ClayCharacter';
import { COLOR_HEX } from '../components/board/colors';
import { coinDeltaForSeat } from '@ludo/shared';
import type { BettingSeat } from '@ludo/shared';

const MEDALS = ['🥇', '🥈', '🥉', '4th'];

export default function SummaryScreen() {
  const navigate = useNavigate();
  const { room } = useConnection();
  const { snap, ranking, mySessionId } = useGame();
  const settings = useSettings();
  const dark = settings.theme === 'dark';

  if (!snap) return null;
  const entries =
    ranking ??
    snap.players
      .map((p, seat) => ({
        seat,
        nickname: p.nickname,
        rank: p.finishedRank || 4,
        captures: 0,
        tokensHome: p.tokens.filter((t) => t === 56).length,
      }))
      .sort((a, b) => a.rank - b.rank);

  // Same math the server settles with. The client has no account ids, so humans
  // get a placeholder 0. Go by `staked`, not `isBot`: a quitter shows as a bot
  // but still pays in.
  const bettingSeats: BettingSeat[] = entries.map((e) => {
    const p = snap.players[e.seat];
    const staked = p?.staked ?? false;
    return {
      seat: e.seat,
      isBot: !staked,
      userId: staked ? 0 : null,
      rank: e.rank,
      forfeited: p?.forfeitedBet ?? false,
    };
  });

  const winner = entries[0];
  const winnerColor = snap.players[winner?.seat ?? 0]?.color ?? 'red';
  const iWon = snap.players[winner?.seat ?? -1]?.sessionId === mySessionId;

  const home = () => {
    clearReconnectToken();
    room?.leave(true);
    navigate('/');
  };

  const confetti = Array.from({ length: 34 }, (_, i) => ({
    left: (i * 37) % 100,
    w: 6 + ((i * 13) % 8),
    dur: 2.2 + ((i * 7) % 20) / 10,
    delay: ((i * 11) % 22) / 10,
    color: ['#ff9a8b', '#9be3a8', '#8fc7ff', '#ffd97d', '#b98bff', '#ff8ab5'][i % 6]!,
  }));

  return (
    <div className="relative z-10 w-full max-w-md space-y-5" style={{ animation: 'win-pop .4s ease' }}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {confetti.map((cf, i) => (
          <span
            key={i}
            className="absolute rounded-sm"
            style={{
              left: `${cf.left}%`,
              top: -30,
              width: cf.w,
              height: cf.w + 5,
              background: cf.color,
              animation: `confetti-fall ${cf.dur}s linear ${cf.delay}s infinite`,
            }}
          />
        ))}
      </div>
      <div className="clay p-8 text-center" style={{ background: dark ? '#34314f' : '#fdf6ec' }}>
        <div
          className="mx-auto mb-3"
          style={{
            width: 110,
            height: 132,
            animation: 'dance-wiggle 0.7s ease-in-out infinite',
            transformOrigin: 'center bottom',
          }}
        >
          <ClayCharacter color={COLOR_HEX[winnerColor] ?? '#b98bff'} mode="clay" />
        </div>
        <div className="font-display text-4xl font-extrabold" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
          {iWon ? 'You win! 🎉' : `${winner?.nickname} wins!`}
        </div>
      </div>

      <div className="clay p-5" style={{ background: dark ? '#34314f' : '#fdf6ec' }}>
        <div className="space-y-2">
          {entries.map((e) => {
            const p = snap.players[e.seat];
            const coinDelta = coinDeltaForSeat(snap.betAmount, bettingSeats, e.seat);
            const showCoins = snap.betAmount > 0 && coinDelta !== 0;

            return (
              <div
                key={e.seat}
                className="clay-pressed flex items-center gap-3 rounded-2xl px-4 py-2.5"
                style={{ background: dark ? '#3c3959' : '#f4ede3' }}
              >
                <span className="w-8 text-lg font-extrabold">{MEDALS[e.rank - 1] ?? e.rank}</span>
                <div className="h-6 w-6 rounded-full" style={{ background: COLOR_HEX[p?.color ?? 'red'] }} />
                <span className="font-extrabold" style={{ color: dark ? '#f3eefe' : '#4a4258' }}>
                  {e.nickname}
                  {p?.sessionId === mySessionId ? ' (you)' : ''}
                </span>
                <span
                  className="ml-auto flex items-center gap-2 text-xs font-bold opacity-50"
                  style={{ color: dark ? '#f3eefe' : '#4a4258' }}
                >
                  <span>
                    🏠 {e.tokensHome} · ⚔️ {e.captures}
                  </span>
                  {snap.betAmount > 0 && p?.forfeitedBet && <span title="Left mid-match">🏳️</span>}
                  {showCoins && (
                    <span style={{ color: coinDelta >= 0 ? '#22c55e' : '#ef4444' }}>
                      {coinDelta >= 0 ? '+' : ''}
                      {coinDelta}💰
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={home}
        className="clay w-full cursor-pointer rounded-2xl border-0 bg-clay-yellow py-4 font-body text-lg font-extrabold text-[#7a5b18]"
      >
        Play again
      </button>
    </div>
  );
}
