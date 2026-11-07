# Deployment

## The short answer on Vercel

**Vercel works for the frontend, not for the game server.** The split:

| Piece                       | Vercel?                         | Why                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/client` (static SPA)  | ✅ Yes — ideal, free            | Just static files after `vite build`                                                                                                                                                                                                                                             |
| `apps/api` (stateless REST) | ⚠️ Possible but not recommended | Would need rework into serverless functions; a $5 Railway service is simpler                                                                                                                                                                                                     |
| `apps/realtime` (Colyseus)  | ❌ **No**                       | Rooms hold live match state **in process memory** over long-lived websockets. Vercel's serverless/websocket model can't guarantee the same instance keeps a connection or its memory — the room's authoritative state would vanish mid-game. It needs a persistent Node process. |

So yes: **FE on Vercel, BE (realtime + api) on a persistent-process host** (Railway recommended; Fly.io if you want to pick regions close to players).

## Step-by-step

### 1. Backend on Railway (~$5/mo total)

Create one Railway project from this repo with **two services**:

|                | Service A (realtime)                                                               | Service B (api)                                                               |
| -------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Root directory | repo root                                                                          | repo root                                                                     |
| Build          | `pnpm install`                                                                     | `pnpm install`                                                                |
| Start command  | `pnpm --filter @ludo/realtime start`                                               | `pnpm --filter @ludo/api start`                                               |
| Env vars       | `DATABASE_URL`, `REALTIME_PORT=$PORT`, `CORS_ORIGIN=https://<your-app>.vercel.app` | `DATABASE_URL`, `API_PORT=$PORT`, `CORS_ORIGIN=https://<your-app>.vercel.app` |
| Health check   | `/health`                                                                          | `/health`                                                                     |

Notes:

- Railway injects `$PORT`; both servers read their port from env.
- Run migrations once: `pnpm --filter @ludo/db migrate` (locally against the same `DATABASE_URL`, or as a Railway one-off command).
- **One instance only** for realtime — rooms live in memory. Scale up (CPU/RAM) not out; going multi-instance later requires the Colyseus Redis presence/driver.
- Set a billing alert; Railway has no hard spend cap.

### 2. Frontend on Vercel ($0)

- Import the repo in Vercel; set **Root Directory** to `apps/client`.
- Build command: `pnpm build` · Output directory: `dist`.
- `apps/client/vercel.json` already handles the SPA rewrite (deep links like `/room/ABC123`).
- Env vars (Production): `VITE_WS_URL=wss://<realtime>.up.railway.app` and `VITE_API_URL=https://<api>.up.railway.app`.
  Use `wss://` (TLS) — Railway terminates TLS for you.

### 3. After first deploy — checklist

1. `https://<api>/health` → `{ ok: true, db: true }`
2. `https://<realtime>/health` → `{ ok: true }`
3. Open the Vercel URL on two phones, create/join a room, play.
4. Check Neon: `SELECT * FROM matches ORDER BY id DESC LIMIT 5;`

## Alternative: single backend service

To save a service, you can mount the api routes inside the realtime express app (one process, one $5 service). Trade-off: a heavy stats query shares the event loop with live games, and you lose independent scaling — fine for MVP, split later. (The code split already makes this a 10-line change in `apps/realtime/src/index.ts`.)
