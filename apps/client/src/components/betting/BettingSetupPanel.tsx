import type { GameSnap } from '../../store/gameStore';

interface BettingSetupPanelProps {
  snap: GameSnap;
  isHost: boolean;
  mySessionId: string;
  myBalance: number;
  balanceLoading: boolean;
  onBetAmountChange: (amount: number) => void;
  onAcceptBet: () => void;
  onDeclineBet: () => void;
}

export function BettingSetupPanel({
  snap,
  isHost,
  mySessionId,
  myBalance,
  balanceLoading,
  onBetAmountChange,
  onAcceptBet,
  onDeclineBet,
}: BettingSetupPanelProps) {
  const { betAmount, players } = snap;
  const myPlayer = players.find((p) => p.sessionId === mySessionId);
  const myAccepted = myPlayer?.acceptedBet ?? false;
  const canAcceptBet = !balanceLoading && myBalance >= betAmount;
  // Bots never stake, so only humans count toward the pot.
  const bettors = players.filter((p) => !p.isBot);
  const acceptedCount = bettors.filter((p) => p.acceptedBet).length;
  const totalPool = betAmount * bettors.length;
  const winnerNet = betAmount * Math.max(0, bettors.length - 1);
  const wagerVoid = betAmount > 0 && bettors.length < 2;

  if (isHost) {
    return (
      <div className="clay bg-board-light p-5">
        <div className="mb-3 font-display text-lg font-extrabold text-ink-light">🎲 Betting Setup</div>

        {/* Wait for the wallet: clamping to a balance that hasn't loaded (0) would zero the bet. */}
        {balanceLoading ? (
          <div className="mb-4 rounded-lg bg-seg-light px-3 py-3 text-sm font-bold opacity-60">
            Loading your wallet…
          </div>
        ) : (
          <div className="mb-4 space-y-2">
            <div className="flex items-center justify-between text-sm font-bold opacity-70">
              <span>Wager amount:</span>
              <span>{myBalance} 💰 available</span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-bold opacity-50">0</span>
              <input
                type="range"
                min="0"
                max={Math.max(myBalance, betAmount)}
                value={betAmount}
                onChange={(e) => onBetAmountChange(Number(e.target.value))}
                className="h-2 w-full cursor-pointer rounded-lg bg-board-dark appearance-none"
                style={{
                  background: `linear-gradient(to right, rgb(255, 154, 139) 0%, rgb(155, 227, 168) ${(betAmount / Math.max(myBalance, betAmount, 1)) * 100}%, rgb(218, 214, 224) ${(betAmount / Math.max(myBalance, betAmount, 1)) * 100}%, rgb(218, 214, 224) 100%)`,
                }}
              />
              <span className="text-xs font-bold opacity-50">{myBalance}</span>
            </div>

            <input
              type="number"
              min="0"
              max={myBalance}
              value={betAmount}
              onChange={(e) => onBetAmountChange(Math.max(0, Number(e.target.value)))}
              className="clay-pressed w-full rounded-lg bg-seg-light px-3 py-2 font-bold text-ink-light"
              placeholder="Enter bet amount"
            />
          </div>
        )}

        <div className="mb-4 rounded-lg bg-seg-light px-3 py-2 text-sm font-bold opacity-70">
          Pool: {totalPool} 💰 ({acceptedCount}/{bettors.length} players ready)
        </div>

        {wagerVoid && (
          <div className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs font-bold">
            ⚠️ Bots don't stake coins — this wager pays nothing until a second human joins.
          </div>
        )}

        <div className="space-y-1 rounded-lg bg-seg-light px-3 py-2">
          <div className="text-xs font-bold opacity-50">Players acceptance:</div>
          {players.map((p) => (
            <div key={p.sessionId} className="text-xs font-bold opacity-70">
              {p.acceptedBet ? '✓' : '○'} {p.nickname}
              {p.sessionId === mySessionId ? ' (you, host)' : ''}
              {!p.acceptedBet && p.sessionId !== mySessionId ? ' - waiting' : ''}
            </div>
          ))}
        </div>

        <div className="mt-3 text-xs opacity-60">💡 Set to 0 for no betting</div>
      </div>
    );
  }

  return (
    <div className="clay bg-board-light p-5">
      <div className="mb-3 font-display text-lg font-extrabold text-ink-light">🎲 Betting Setup</div>

      <div className="mb-4 space-y-2 rounded-lg bg-seg-light px-3 py-3">
        <div className="text-xs font-bold opacity-50">Current wager:</div>
        <div className="text-2xl font-extrabold text-ink-light">{betAmount} 💰</div>

        {betAmount > 0 && !wagerVoid && (
          <div className="mt-2 space-y-1 text-xs font-bold opacity-60">
            <div>🥇 Finish 1st: +{winnerNet} 💰</div>
            <div>🏁 Anyone else: −{betAmount} 💰</div>
          </div>
        )}

        {wagerVoid && (
          <div className="mt-2 text-xs font-bold text-amber-600">
            ⚠️ Bots don't stake coins — this wager pays nothing until a second human joins.
          </div>
        )}

        {betAmount === 0 && <div className="mt-2 text-xs font-bold opacity-60">No betting for this game</div>}
      </div>

      <div
        className={`mb-4 rounded-lg px-3 py-2 text-sm font-bold ${
          canAcceptBet ? 'bg-seg-light opacity-70' : 'border-2 border-red-500 bg-red-500/10'
        }`}
      >
        {canAcceptBet ? (
          <>
            Your balance: {myBalance} 💰 <span className="text-green-500">✓ enough!</span>
          </>
        ) : (
          <>
            <span className="text-red-500">⚠️ You don't have enough coins!</span>
            <br />
            Bet: {betAmount} 💰 | Your balance: {myBalance} 💰
          </>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={onAcceptBet}
          disabled={!canAcceptBet || myAccepted}
          className={`flex-1 cursor-pointer rounded-xl border-0 py-3 font-bold transition-opacity ${
            canAcceptBet && !myAccepted
              ? 'clay bg-clay-green text-[#2c6b3d]'
              : 'clay bg-seg-light text-ink-light opacity-50'
          }`}
        >
          {myAccepted ? '✓ Accepted' : 'Accept bet'}
        </button>

        {betAmount > 0 && !myAccepted && (
          <button
            onClick={onDeclineBet}
            className="flex-1 cursor-pointer rounded-xl border-0 bg-transparent py-3 font-bold text-red-500"
          >
            Decline ✗
          </button>
        )}
      </div>

      <div className="space-y-1 rounded-lg bg-seg-light px-3 py-2">
        <div className="text-xs font-bold opacity-50">Other players:</div>
        {players
          .filter((p) => p.sessionId !== mySessionId)
          .map((p) => (
            <div key={p.sessionId} className="text-xs font-bold opacity-70">
              {p.acceptedBet ? '✓' : '○'} {p.nickname}
              {p.acceptedBet ? ' - accepted' : ' - waiting'}
            </div>
          ))}
      </div>
    </div>
  );
}
