import { Router } from 'express';
import { getHistoryByDeviceToken, getStatsByDeviceToken, upsertGuestUser } from '@ludo/db';
import { isDeviceToken, limitParam, validateDeviceToken } from '../http.js';

export const guests = Router();
validateDeviceToken(guests);

guests.post('/guests', async (req, res) => {
  const { deviceToken, nickname } = req.body ?? {};
  const name = typeof nickname === 'string' ? nickname.trim().slice(0, 20) : '';
  if (!isDeviceToken(deviceToken) || !name) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }
  const id = await upsertGuestUser(deviceToken, name);
  res.json({ id, nickname: name });
});

guests.get('/stats/:deviceToken', async (req, res) => {
  const stats = await getStatsByDeviceToken(req.params.deviceToken);
  if (!stats) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json(stats);
});

guests.get('/history/:deviceToken', async (req, res) => {
  res.json(await getHistoryByDeviceToken(req.params.deviceToken, limitParam(req.query.limit, 20, 100)));
});
