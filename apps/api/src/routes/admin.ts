import { Router } from 'express';
import { deleteStaleGuestAccounts, getStaleGuestAccounts } from '@ludo/db';
import { requireAdmin } from '../http.js';

// Prune guests who never played a match. Preview with GET, then POST with
// { "confirmed": true } to delete. Both need `Authorization: Bearer $ADMIN_TOKEN`.
export const admin = Router();
admin.use('/admin', requireAdmin);

function inactiveDays(raw: unknown): number {
  return Math.max(Math.floor(Number(raw)) || 30, 1);
}

admin.get('/admin/cleanup/stale-accounts', async (req, res) => {
  const days = inactiveDays(req.query.inactiveDays);
  const accounts = await getStaleGuestAccounts(days);
  res.json({ count: accounts.length, inactiveDays: days, accounts });
});

admin.post('/admin/cleanup/stale-accounts', async (req, res) => {
  if (req.body?.confirmed !== true) {
    res.status(400).json({ error: 'CLEANUP_NOT_CONFIRMED' });
    return;
  }
  const days = inactiveDays(req.body.inactiveDays);
  const deleted = await deleteStaleGuestAccounts(days);
  res.json({ deleted, inactiveDays: days });
});
