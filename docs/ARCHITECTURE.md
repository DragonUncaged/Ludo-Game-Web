# Architecture

```
apps/client   (Vite+React SPA, static)  ──HTTPS──▶  apps/api      (Express REST, stateless)
      │                                                  │
      └────────WebSocket (colyseus.js)──▶  apps/realtime (Colyseus, stateful rooms)
                                                         │
                packages/engine  (pure TS rules + scorer + bot + dice — shared client/realtime)
                packages/shared  (protocol message types, join-code alphabet)
                packages/db      (pg Pool, queries, migrations — shared api/realtime)
                                                         ▼
                                            Neon Postgres (pooled connection string)
```

## Service split (designed for a backend-heavy future)

- **`apps/api` — stateless.** Guest upsert, profiles, stats, match history. Later: friends,
  leaderboards, progression, shop, missions. Scales horizontally with zero coordination.
- **`apps/realtime` — stateful.** Colyseus rooms hold live match state in memory: turn loop,
  timers, bots, reconnect. Also serves `GET /rooms/:code` (room lookup needs the local
  matchMaker). One instance for MVP; scale later with Colyseus Redis presence/driver.
- Both import `packages/db` directly — no inter-service calls in the MVP.
- **`packages/engine` is isomorphic**: the realtime server uses it as the authority; the client
  uses the same code for instant legal-move highlighting. One implementation, no drift.

## State ownership

| State | Lives in | Why |
|---|---|---|
| Live match (tokens, turn, dice, timers) | Realtime room memory | Hot path; no DB round-trip per roll |
| Synced view of match | Colyseus schema → clients | Auto-delta sync, late-join/reconnect hydration |
| Guests, matches, results, stats | Neon Postgres | Durable, relational, transactional |
| Crash-recovery snapshot | `matches.snapshot` JSONB | Fire-and-forget update per move |

## Deployment

- **Local dev**: `pnpm dev` runs Vite (5173) + api (8080) + realtime (2567) concurrently.
- **Prod**: client → Cloudflare Pages / Vercel static ($0); api + realtime → two Railway
  services (~$5/mo total — set a billing alert) or Fly.io for geo-latency; DB → existing Neon.
- Vercel/Netlify serverless **cannot** host the realtime service (stateful websockets).
- Env: `DATABASE_URL` (pooled `-pooler` string) for api + realtime; `VITE_API_URL`,
  `VITE_WS_URL` baked into the client build.

## Security / anti-cheat model

Clients send **intents** (`roll`, `move`), never results. The server validates sender ==
current player, turn phase, and move legality via the engine, then broadcasts outcomes.
Dice use `crypto.randomInt` server-side; the client never sees a seed. Rate limiting and a
turn deadline stop stalling; a watchdog force-advances stuck turns.
