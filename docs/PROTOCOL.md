# Realtime Protocol

Room name: `ludo`. Transport: Colyseus (websocket). Types live in `packages/shared/src/protocol.ts`.

## Synced schema (server → all clients, delta-synced)

```
LudoState {
  roomPhase: 'waiting' | 'playing' | 'ended'
  joinCode: string
  hostSessionId: string
  players: PlayerSchema[] {
    sessionId, nickname, color, isBot, connected,
    finishedRank: int8        // 0 = playing, 1..4 = placement
    tokens: int8[4]           // position encoding (see GAME_RULES.md)
  }
  currentPlayer: int8         // seat index, -1 in lobby
  turnPhase: 'awaitRoll' | 'awaitMove' | 'animating'
  dice: int8                  // last roll, 0 = none
  consecutiveSixes: uint8
  turnSeconds: uint8
  turnDeadline: number        // server epoch ms (clients subtract clock offset)
  diceMode: 'fair' | 'dynamic'
}
```

Server-private (never synced): authoritative engine `GameState`, dice roller + per-seat
`rollsSinceSix`, `turnNonce`, pending timers, DB row ids.

## Client → server intents

| Message | Payload | Guards |
|---|---|---|
| `roll` | `{}` | sender is current human seat, `turnPhase === 'awaitRoll'` |
| `move` | `{ tokenIndex }` | sender is current, `awaitMove`, tokenIndex in legal set |
| `startGame` | `{}` | host only, `waiting`; fills empty seats with bots |
| `setOptions` | `{ seats?, diceMode?, turnSeconds? }` | host only, `waiting` |
| `time` | `{ t0 }` | any; server replies `timeResult { t0, server }` for clock offset |

Join options: `{ nickname, deviceToken, create?: { seats, diceMode, turnSeconds } }`.

## Server → client events (broadcast)

| Event | Payload |
|---|---|
| `diceRolled` | `{ seat, value, legalTokens: number[], autoPass, forfeit }` |
| `moveApplied` | `{ seat, tokenIndex, path: number[], captures: [{seat, tokenIndex, fromPos}], finishedToken: boolean, extraRoll: boolean }` |
| `turnChanged` | `{ seat, deadline }` |
| `playerFinished` | `{ seat, rank }` |
| `gameOver` | `{ ranking: [{seat, nickname, rank, captures, tokensHome}] }` |
| `joinError` (single client) | `{ code: 'ROOM_FULL' | 'ROOM_STARTED' | 'ALREADY_IN_ROOM' }` |

Schema is the ground truth (late join / reconnect hydration). Events carry choreography —
the step path and capture list drive client animations; clients never derive animations
from state diffs. There are **no timer tick messages**: the timer ring renders from
`turnDeadline − clockOffset` (offset estimated once via the `time` handshake).

## Turn flow (server-side, single-threaded Colyseus clock)

1. `beginTurn(seat)`: `turnNonce++`, deadline = now + turnSeconds (one deadline covers roll
   **and** move). Bot/disconnected seats are scheduled with human-ish delays instead.
2. `roll` → dice.roll → `engine.applyRoll` → broadcast `diceRolled`. Forfeit/auto-pass →
   advance after 1.2s. Else `awaitMove`.
3. `move` → `engine.applyMove` → broadcast `moveApplied` → `animating` → server-side fixed
   delay (`200 + 120×steps + 900 if capture` ms) → extra roll ? same seat : advance.
4. Timeout (nonce-guarded): auto-roll if needed, then `pickBestMove` — a timed-out player
   always gets a sensible move. Watchdog force-advances any turn stuck 5s past deadline.

## Reconnect

Playing-phase disconnect → seat marked `connected=false`, `allowReconnection(client, 120)`.
Client stores `reconnectionToken` in sessionStorage keyed by roomId and tries `reconnect()`
first on load. Success rehydrates from schema (no animations). 120s timeout converts the
seat to a bot permanently. Lobby-phase leave removes the player (host migrates if needed).
