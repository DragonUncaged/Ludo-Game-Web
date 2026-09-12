import { useEffect } from 'react';
import type { Room } from 'colyseus.js';
import { useConnection } from '../store/connectionStore';
import { useGame } from '../store/gameStore';
import type { GameSnap } from '../store/gameStore';
import { saveReconnectToken } from '../lib/colyseus';
import { sfx } from '../lib/sfx';
import type { DiceRolledEvent, GameOverEvent, TimeResultEvent } from '@ludo/shared';

function toArray(x: unknown): number[] {
  return Array.from(x as Iterable<number>).map(Number);
}

function mirror(state: any): GameSnap {
  return {
    roomPhase: state.roomPhase,
    joinCode: state.joinCode,
    hostSessionId: state.hostSessionId,
    players: Array.from(state.players as Iterable<any>).map((p: any) => ({
      sessionId: p.sessionId,
      nickname: p.nickname,
      color: p.color,
      isBot: p.isBot,
      connected: p.connected,
      finishedRank: p.finishedRank,
      tokens: toArray(p.tokens),
      coinBalance: p.coinBalance,
      acceptedBet: p.acceptedBet,
      staked: p.staked,
      forfeitedBet: p.forfeitedBet,
      equippedCosmeticId: p.equippedCosmeticId,
      equippedCosmeticCategory: p.equippedCosmeticCategory,
    })),
    currentPlayer: state.currentPlayer,
    turnPhase: state.turnPhase,
    dice: state.dice,
    turnSeconds: state.turnSeconds,
    turnDeadline: state.turnDeadline,
    diceMode: state.diceMode,
    betAmount: state.betAmount,
    bettingStatus: state.bettingStatus,
  };
}

/**
 * Wires a joined room into the stores. Every handler is guarded by an `active`
 * flag: StrictMode/HMR re-runs register fresh handlers and deactivate the old
 * ones, so events are processed exactly once. `seq` dedupe is belt-and-braces
 * on top of that.
 */
export function useRoomEvents(room: Room | null): void {
  const game = useGame;
  const connection = useConnection;

  useEffect(() => {
    if (!room) return;
    let active = true;
    let lastDiceSeq = 0;

    game.getState().setMySessionId(room.sessionId);
    saveReconnectToken(room);
    if (import.meta.env.DEV) (window as unknown as { __room?: Room }).__room = room;

    // After a reconnect, room.state may not be hydrated yet — guard and let
    // onStateChange deliver the first full snapshot.
    const trySnap = (state: any) => {
      if (active && state?.players) game.getState().applySnap(mirror(state));
    };
    trySnap(room.state);
    room.onStateChange(trySnap);

    room.onMessage<DiceRolledEvent>('diceRolled', (msg) => {
      if (!active) return;
      if (msg.seq && msg.seq <= lastDiceSeq) return;
      if (msg.seq) lastDiceSeq = msg.seq;
      const g = game.getState();
      g.setRolling(true);
      sfx.roll();
      // tumble briefly, then land on the value and reveal legal tokens
      setTimeout(() => {
        if (!active) return;
        const gg = game.getState();
        gg.setShownDice(msg.value);
        gg.setRolling(false);
        const seat = gg.snap?.players.findIndex((p) => p.sessionId === room.sessionId) ?? -1;
        // timeout auto-rolls play themselves — don't tease a choice that isn't there
        gg.setLegalTokens(
          msg.seat === seat && !msg.autoPass && !msg.forfeit && !msg.auto ? msg.legalTokens : []
        );
      }, 420);
    });
    room.onMessage('moveApplied', () => {
      if (active) game.getState().setLegalTokens([]);
    });
    room.onMessage('turnChanged', () => {
      if (active) game.getState().setLegalTokens([]);
    });
    room.onMessage('playerFinished', () => {});
    room.onMessage<GameOverEvent>('gameOver', (msg) => {
      if (!active) return;
      sfx.win();
      // let the last move/capture animation land before switching to the summary
      setTimeout(() => {
        if (active) game.getState().setRanking(msg.ranking);
      }, 1200);
    });
    room.onMessage<TimeResultEvent>('timeResult', ({ t0, server }) => {
      if (!active) return;
      const now = Date.now();
      game.getState().setClockOffset(server - (t0 + now) / 2);
    });
    room.send('time', { t0: Date.now() });

    room.onLeave(() => {
      if (active) connection.getState().setRoom(null);
    });

    return () => {
      active = false;
    };
  }, [room]);
}
