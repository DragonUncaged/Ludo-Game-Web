# Ludo Royale 🎲

A modern online multiplayer Ludo with claymorphism visuals, animated clay characters,
AI bots, and thrill systems (turn timers, capture drama, casual-mode dynamic dice pacing).

## Quick start

```bash
pnpm install
cp .env.example .env       # fill DATABASE_URL with your Neon pooled connection string
pnpm --filter @ludo/db migrate
pnpm dev                   # client :5173 · realtime :2567 · api :8080
```

Open http://localhost:5173, pick a nickname, create a room, share the 6-letter code.
Empty seats become bots when the host starts. Works without a DB too (persistence
just switches off when `DATABASE_URL` is unset).

## Workspace

| Package | What |
|---|---|
| `packages/engine` | Pure TS Ludo rules + move scorer + bots + dice (zero deps, shared by server & client) |
| `packages/shared` | Protocol message types, join-code helpers |
| `packages/db` | pg pool, SQL migrations, query layer (Neon Postgres) |
| `apps/realtime` | Colyseus server — authoritative rooms, timers, bots, reconnect |
| `apps/api` | Express REST — guests, stats, match history |
| `apps/client` | Vite + React SPA — clay UI, animations, 2D/clay + light/dark modes |

## Commands

```bash
pnpm test                          # engine unit tests + realtime integration test
pnpm typecheck                     # strict TS across all packages
pnpm --filter @ludo/engine test    # rules/scorer/dice suites only
node apps/realtime/scripts/playmatch.mjs   # scripted full match vs a running server
```

Dev toggles (env for `apps/realtime`): `LUDO_FAST=1` accelerates bot/animation timing
(used by tests), `FIXED_ROLLS=6,2,6` scripts dice for choreography testing,
`ALLOW_DUP_DEVICE=1` lets one browser join a room twice.

## Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — services, state ownership, deployment
- [docs/GAME_RULES.md](docs/GAME_RULES.md) — rules, board encoding, dice pacing math
- [docs/PROTOCOL.md](docs/PROTOCOL.md) — schema, intents, events, turn flow, reconnect
- [docs/DB.md](docs/DB.md) — Postgres schema and write points
