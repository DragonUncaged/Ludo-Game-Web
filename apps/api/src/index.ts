import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { dbEnabled, getLeaderboard, loadRootEnv } from '@ludo/db';
import { limitParam } from './http.js';
import { admin } from './routes/admin.js';
import { coins } from './routes/coins.js';
import { guests } from './routes/guests.js';
import { shop } from './routes/shop.js';

loadRootEnv();
const port = Number(process.env.API_PORT ?? 8080);

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '16kb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, db: dbEnabled() });
});

// Everything below needs Postgres.
app.use((_req, res, next) => {
  if (dbEnabled()) next();
  else res.status(503).json({ error: 'DB_DISABLED' });
});

app.get('/leaderboard', async (req, res) => {
  res.json(await getLeaderboard(limitParam(req.query.limit, 50, 500)));
});

app.use(guests, coins, shop, admin);

app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// Express 5 routes rejected promises here, so handlers don't need their own try/catch.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const status = (err as { status?: number }).status ?? 500;
  if (status < 500) {
    res.status(status).json({ error: 'BAD_REQUEST' }); // e.g. malformed JSON body
    return;
  }
  console.error(`[api] ${req.method} ${req.path} failed`, err);
  res.status(500).json({ error: 'DB_ERROR' });
});

app.listen(port, () => console.log(`[api] listening on :${port} (db: ${dbEnabled()})`));
