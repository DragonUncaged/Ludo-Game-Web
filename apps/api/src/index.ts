import express from 'express';
import cors from 'cors';
import {
  dbEnabled,
  getHistoryByDeviceToken,
  getStatsByDeviceToken,
  loadRootEnv,
  upsertGuestUser,
  getCoinBalance,
  getCoinTransactionHistory,
  getStaleGuestAccounts,
  deleteStaleGuestAccounts,
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

// Coin system endpoints
app.get('/coins/:deviceToken/balance', async (req, res) => {
  if (!UUID_RE.test(req.params.deviceToken)) return res.status(400).json({ error: 'BAD_REQUEST' });
  try {
    const balance = await getCoinBalance(req.params.deviceToken);
    if (balance === null) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ balance });
  } catch (err) {
    console.error('[api] coin balance failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.get('/coins/:deviceToken/transactions', async (req, res) => {
  if (!UUID_RE.test(req.params.deviceToken)) return res.status(400).json({ error: 'BAD_REQUEST' });
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  try {
    const transactions = await getCoinTransactionHistory(req.params.deviceToken, limit);
    res.json(transactions);
  } catch (err) {
    console.error('[api] coin transactions failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

// Admin cleanup endpoints
// Note: These should be protected with authentication in production
app.get('/admin/cleanup/stale-accounts', async (req, res) => {
  if (!dbEnabled()) {
    return res.status(503).json({ error: 'DB_DISABLED' });
  }
  try {
    const inactiveDays = Math.max(Number(req.query.inactiveDays) || 30, 1);
    const staleAccounts = await getStaleGuestAccounts(inactiveDays, true);
    res.json({
      count: staleAccounts.length,
      inactiveDays,
      accounts: staleAccounts,
    });
  } catch (err) {
    console.error('[api] stale accounts query failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.post('/admin/cleanup/stale-accounts', async (req, res) => {
  if (!dbEnabled()) {
    return res.status(503).json({ error: 'DB_DISABLED' });
  }
  const { confirmed } = req.body ?? {};
  if (confirmed !== true) {
    return res.status(400).json({ error: 'CLEANUP_NOT_CONFIRMED' });
  }
  try {
    const inactiveDays = Math.max(Number(req.body.inactiveDays) || 30, 1);
    const deletedCount = await deleteStaleGuestAccounts(inactiveDays, true);
    res.json({
      deleted: deletedCount,
      inactiveDays,
      message: `Deleted ${deletedCount} stale guest accounts`,
    });
  } catch (err) {
    console.error('[api] stale accounts deletion failed', err);
    res.status(500).json({ error: 'DB_ERROR' });
  }
});

app.listen(port, () => console.log(`[api] listening on :${port} (db: ${dbEnabled()})`));
