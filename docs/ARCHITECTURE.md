# Architecture

```
apps/client  (static SPA)  ──── HTTPS ────▶  apps/api       (Express, stateless)
     │                                            │
     └──── WebSocket (@colyseus/sdk) ──▶  apps/realtime  (Colyseus, stateful)
                                                  │
              packages/engine   rules, scorer, bot, dice (used by client and server)
              packages/shared   message types, betting + bonus math, join codes
              packages/db       pg pool, queries, migrations (used by api and realtime)
                                                  ▼
                                              Postgres
```

## Why two backends

- **`apps/realtime`** holds live matches in memory: the turn loop, timers, bots and reconnects.
  It also serves `GET /rooms/:code`, because looking a room up by join code needs this process's
  matchmaker. Rooms live in one process, so it runs as a single instance.
- **`apps/api`** is everything that is just a database read or write: guests, stats, the wallet,
  the daily bonus, the shop, the leaderboard and admin cleanup. It's stateless and can scale out.
- Both talk to Postgres through `packages/db`. Neither calls the other.

`packages/engine` has no dependencies. The server uses it as the authority and the client uses the
same code to place tokens on the board, so the two can't drift apart.

## Where state lives

| State                                   | Lives in           | Why                                        |
| --------------------------------------- | ------------------ | ------------------------------------------ |
| Live match (tokens, turn, dice, timers) | Room memory        | Hot path, no DB round-trip per roll        |
| What clients see of the match           | Colyseus schema    | Delta-synced, rehydrates on reconnect      |
| Guests, results, stats, coins, items    | Postgres           | Durable, and settlements need transactions |
| Crash snapshot of a match               | `matches.snapshot` | Written after every move, fire-and-forget  |

## Trust

Clients send intents (`roll`, `move`, `setBetAmount`, ...), never results. The room checks that
the sender is the current player, the turn phase is right and the move is legal, then broadcasts
what happened. Dice use `crypto.randomInt` on the server.

Coin balances are only ever changed by the server: bet settlement in one transaction with row
locks, bonus claims guarded in SQL, purchases locked the same way. The client only previews.

Turns can't be stalled: each one has a deadline after which the server rolls and moves for the
player, and a watchdog restarts any turn whose timer was lost.

The api has no auth beyond the device token in the URL, which is fine for guest data. Admin
routes are off unless `ADMIN_TOKEN` is set.
