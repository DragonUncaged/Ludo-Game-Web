import express from 'express';
import cors from 'cors';
import {
  dbEnabled,
  getHistoryByDeviceToken,
  getStatsByDeviceToken,
  loadRootEnv,
  upsertGuestUser,
} from '@ludo/db';

loadRootEnv();
const port = Number(process.env.API_PORT ?? 8080);
const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true }));
app.use(express.json());

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

app.get('/health', (_req, res) => res.json({ ok: true, db: dbEnabled() }));

app.post('/guests', async (req, res) => {
  const { deviceToken, nickname } = req.body ?? {};
  if (!UUID_RE.test(String(deviceToken)) || typeof nickname !== 'string' || !nickname.trim()) {
    return res.status(400).json({ error: 'BAD_REQUEST' });
  }
  try {
    const id = await upsertGuestUser(deviceToken, nickname.trim().slice(0, 20));
    res.json({ id, nickname: nickname.trim().slice(0, 20) });
  } catch (err) {
    console.error('[api] guest upsert failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.get('/stats/:deviceToken', async (req, res) => {
  if (!UUID_RE.test(req.params.deviceToken)) return res.status(400).json({ error: 'BAD_REQUEST' });
  try {
    const stats = await getStatsByDeviceToken(req.params.deviceToken);
    if (!stats) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(stats);
  } catch (err) {
    console.error('[api] stats failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.get('/history/:deviceToken', async (req, res) => {
  if (!UUID_RE.test(req.params.deviceToken)) return res.status(400).json({ error: 'BAD_REQUEST' });
  try {
    res.json(await getHistoryByDeviceToken(req.params.deviceToken));
  } catch (err) {
    console.error('[api] history failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.listen(port, () => console.log(`[api] listening on :${port} (db: ${dbEnabled()})`));
