# Deploying

The client is static and can go anywhere. The realtime server can't run on serverless platforms:
rooms keep their state in process memory behind long-lived websockets, so it needs a normal,
always-on Node process. The api could be serverless but it's simpler to host it next to realtime.

A setup that works: client on Vercel, realtime and api on Railway, Postgres on Neon.

## Backend (Railway)

One project, two services, both built from the repo root. Make sure they run Node 26
(`engines` and `.nvmrc` both say so) and pnpm 12 (`packageManager`).

|              | realtime                                             | api                                                                       |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Build        | `pnpm install --frozen-lockfile`                     | `pnpm install --frozen-lockfile`                                          |
| Start        | `pnpm --filter @ludo/realtime start`                 | `pnpm --filter @ludo/api start`                                           |
| Health check | `/health`                                            | `/health`                                                                 |
| Env          | `DATABASE_URL`, `REALTIME_PORT=$PORT`, `CORS_ORIGIN` | `DATABASE_URL`, `API_PORT=$PORT`, `CORS_ORIGIN`, `ADMIN_TOKEN` (optional) |

- Run migrations once against the production database: `pnpm --filter @ludo/db migrate` with
  `DATABASE_URL` set.
- Keep realtime at one instance. Scale it up, not out. Several instances would need Colyseus's
  Redis presence and driver.
- `CORS_ORIGIN` takes a comma-separated list, e.g. `https://ludo-royale.vercel.app`.

## Client (Vercel)

- Import the repo and leave the root directory as the repo root. `vercel.json` sets the build
  (`pnpm --filter @ludo/client build`), the output (`apps/client/dist`) and a rewrite of every
  path to `index.html`, so links like `/room/ABC123` work.
- Set `VITE_WS_URL=wss://<realtime host>` and `VITE_API_URL=https://<api host>`. They're baked in
  at build time, so redeploy after changing them.

## After the first deploy

1. `https://<api>/health` returns `{ "ok": true, "db": true }`.
2. `https://<realtime>/health` returns `{ "ok": true }`.
3. Open the site on two devices, create a room on one and join with the code on the other.
