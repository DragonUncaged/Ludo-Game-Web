import { useEffect } from 'react';
import type { Room } from '@colyseus/sdk';
import type { DiceRolledEvent, GameOverEvent, TimeResultEvent } from '@ludo/shared';
import { useConnection } from '../store/connectionStore';
import { useGame } from '../store/gameStore';
import type { GameSnap } from '../store/gameStore';
import { saveReconnectToken } from '../lib/colyseus';
import { sfx } from '../lib/sfx';

// The decoded schema has no static type on the client, hence the `any`s.
function mirror(state: any): GameSnap {
  return {
    roomPhase: state.roomPhase,
    joinCode: state.joinCode,
    hostSessionId: state.hostSessionId,
    players: Array.from(state.players as Iterable<any>).map((p) => ({
      sessionId: p.sessionId,
      nickname: p.nickname,
      color: p.color,
      isBot: p.isBot,
      connected: p.connected,
      finishedRank: p.finishedRank,
      tokens: Array.from(p.tokens as Iterable<number>, Number),
      coinBalance: p.coinBalance,
      acceptedBet: p.acceptedBet,
      staked: p.staked,
      forfeitedBet: p.forfeitedBet,
      equippedCharacter: p.equippedCharacter,
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

/** Mirrors a joined room into the stores. Listeners are unbound on cleanup, so StrictMode's double mount is harmless. */
export function useRoomEvents(room: Room | null): void {
  useEffect(() => {
    if (!room) return;
    let active = true; // guards the timers below, which can outlive the listeners
    let lastDiceSeq = 0;
    const game = () => useGame.getState();

    game().setMySessionId(room.sessionId);
    saveReconnectToken(room);

    // Right after a reconnect room.state can still be empty; the first onStateChange fills it in.
    const onState = (state: { players?: unknown }) => {
      if (state?.players) game().applySnap(mirror(state));
    };
    onState(room.state);
    room.onStateChange(onState);

    const off = [
      room.onMessage<DiceRolledEvent>('diceRolled', (msg) => {
        if (msg.seq && msg.seq <= lastDiceSeq) return;
        if (msg.seq) lastDiceSeq = msg.seq;
        game().setRolling(true);
        sfx.roll();
        // Let the dice tumble a moment before showing the value and the movable tokens.
        setTimeout(() => {
          if (!active) return;
          const g = game();
          g.setShownDice(msg.value);
          g.setRolling(false);
          const mine = g.snap?.players.findIndex((p) => p.sessionId === room.sessionId) ?? -1;
          // An auto-roll from the turn timer also moves for you, so there's nothing to pick.
          const choosable = msg.seat === mine && !msg.autoPass && !msg.forfeit && !msg.auto;
          g.setLegalTokens(choosable ? msg.legalTokens : []);
        }, 420);
      }),
      room.onMessage('moveApplied', () => game().setLegalTokens([])),
      room.onMessage('turnChanged', () => game().setLegalTokens([])),
      room.onMessage('playerFinished', () => {}),
      room.onMessage<GameOverEvent>('gameOver', (msg) => {
        sfx.win();
        // Give the final move's animation time to land before the summary takes over.
        setTimeout(() => {
          if (active) game().setRanking(msg.ranking);
        }, 1200);
      }),
      room.onMessage<TimeResultEvent>('timeResult', ({ t0, server }) => {
        game().setClockOffset(server - (t0 + Date.now()) / 2);
      }),
    ];
    room.send('time', { t0: Date.now() });

    const onLeave = () => useConnection.getState().setRoom(null);
    room.onLeave(onLeave);

    return () => {
      active = false;
      off.forEach((unbind) => unbind());
      room.onStateChange.remove(onState);
      room.onLeave.remove(onLeave);
    };
  }, [room]);
}
