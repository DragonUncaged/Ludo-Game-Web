# Realtime protocol

Room name `ludo`, over Colyseus websockets. Payload types are in `packages/shared/src/protocol.ts`.

## Synced state

```
LudoState {
  roomPhase: 'waiting' | 'playing' | 'ended'
  joinCode, hostSessionId: string
  players: PlayerSchema[] {
    sessionId, nickname, color: string
    isBot, connected: boolean
    finishedRank: int8         // 0 while playing, then 1..4
    tokens: int8[4]            // see GAME_RULES.md
    coinBalance: int32
    acceptedBet, staked, forfeitedBet: boolean
    equippedCharacter: string  // shop skin id, '' for the default
  }
  currentPlayer: int8          // seat index, -1 in the lobby
  turnPhase: 'awaitRoll' | 'awaitMove' | 'animating'
  dice: int8                   // last roll, 0 for none
  consecutiveSixes, turnSeconds: uint8
  turnDeadline: number         // server epoch ms
  diceMode: 'fair' | 'dynamic'
  betAmount: int32
  bettingStatus: 'not_started' | 'in_progress' | 'accepted'
}
```

The engine's own `GameState`, the dice roller, timers and database ids stay on the server.

## Joining

Options: `{ nickname, deviceToken, create?: { seats, diceMode, turnSeconds } }`.

A join is refused with code `4101` once the game has started and `4102` if the same device is
already in the room (`JOIN_ERROR` in shared). Colyseus reserves 4000 to 4010 for itself.

## Client to server

| Message        | Payload                               | Who / when                                |
| -------------- | ------------------------------------- | ----------------------------------------- |
| `roll`         |                                       | Current player, `awaitRoll`               |
| `move`         | `{ tokenIndex }`                      | Current player, `awaitMove`, legal token  |
| `startGame`    |                                       | Host, lobby. Fills empty seats with bots  |
| `setOptions`   | `{ seats?, diceMode?, turnSeconds? }` | Host, lobby                               |
| `setBetAmount` | `{ betAmount }`                       | Host, lobby. Resets everyone's acceptance |
| `acceptBet`    |                                       | Any player, lobby                         |
| `declineBet`   |                                       | Any player, lobby. Voids the wager        |
| `time`         | `{ t0 }`                              | Anyone. Answered with `timeResult`        |

## Server to clients

| Event            | Payload                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `turnChanged`    | `{ seat, deadline }`                                                        |
| `diceRolled`     | `{ seq, seat, value, legalTokens, autoPass, forfeit, auto }`                |
| `moveApplied`    | `{ seq, seat, tokenIndex, path, captures, finishedToken, extraRoll, auto }` |
| `playerFinished` | `{ seat, rank }`                                                            |
| `gameOver`       | `{ ranking: [{ seat, nickname, rank, captures, tokensHome }] }`             |
| `error`          | `{ message }`, when the host's start is refused (bet not accepted, etc.)    |
| `timeResult`     | `{ t0, server }`, only to the sender                                        |

The schema is the source of truth. Events carry the choreography: the client animates `path`
and `captures` from `moveApplied` instead of diffing state. `seq` lets the client drop a
duplicate delivery. There are no timer ticks; the client draws the countdown from
`turnDeadline` minus the clock offset it measured with `time`.

## Turn flow

1. `beginTurn`: bump the turn nonce, set a deadline of `turnSeconds`, broadcast `turnChanged`.
   Bots and disconnected players get scheduled with a short random delay instead.
2. `roll`: roll, `applyRoll`, broadcast `diceRolled`. On a forfeit or no legal move the turn
   passes after a short pause. A manual roll restarts the deadline for the move.
3. `move`: `applyMove`, broadcast `moveApplied`, then wait out the animation
   (`200 + 120 × steps`, plus 900 ms for a capture) before the next turn or extra roll.
4. On timeout the server rolls if needed and plays the best-scoring move. Timers check the nonce
   so stale ones do nothing, and a watchdog restarts any turn stuck well past its deadline.

## Reconnecting

If a player drops mid-game, `onDrop` marks them disconnected and holds the seat for 120 seconds.
The client keeps `room.reconnectionToken` in sessionStorage and tries `client.reconnect()` before
joining fresh, so a page refresh lands back in the same seat (`onReconnect`). If the window runs
out, or the player leaves on purpose, `onLeave` hands the seat to a bot for the rest of the game
and a staked player forfeits their stake. Leaving in the lobby just frees the seat, and the host
role passes on if needed.
