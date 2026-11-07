import { Router } from 'express';
import { claimDailyBonus, getCoinBalance, getCoinTransactionHistory, getDailyBonusState } from '@ludo/db';
import { DAILY_BONUS_COOLDOWN_MS, computeDailyBonus } from '@ludo/shared';
import { limitParam, validateDeviceToken } from '../http.js';

export const coins = Router();
validateDeviceToken(coins);

coins.get('/coins/:deviceToken/balance', async (req, res) => {
  const balance = await getCoinBalance(req.params.deviceToken);
  if (balance === null) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json({ balance });
});

coins.get('/coins/:deviceToken/transactions', async (req, res) => {
  const limit = limitParam(req.query.limit, 50, 500);
  res.json(await getCoinTransactionHistory(req.params.deviceToken, limit));
});

coins.get('/coins/:deviceToken/bonus', async (req, res) => {
  const state = await getDailyBonusState(req.params.deviceToken);
  if (!state) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json({ balance: state.balance, ...computeDailyBonus(state.balance, state.lastBonusAt, state.now) });
});

coins.post('/coins/:deviceToken/bonus', async (req, res) => {
  const { deviceToken } = req.params;
  const state = await getDailyBonusState(deviceToken);
  if (!state) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  const status = computeDailyBonus(state.balance, state.lastBonusAt, state.now);
  if (!status.claimable) {
    res.status(409).json({ error: 'ON_COOLDOWN', balance: state.balance, ...status });
    return;
  }

  // The UPDATE re-checks the cooldown, so a double-click that slipped past the
  // check above still only pays once.
  const claim = await claimDailyBonus(deviceToken, status.amount, DAILY_BONUS_COOLDOWN_MS);
  if (!claim) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  const next = computeDailyBonus(claim.balance, claim.lastBonusAt, Date.now());
  if (!claim.claimed) {
    res.status(409).json({ error: 'ON_COOLDOWN', balance: claim.balance, ...next });
    return;
  }
  res.json({
    claimed: true,
    amount: claim.amount,
    balance: claim.balance,
    claimable: next.claimable,
    nextClaimAt: next.nextClaimAt,
    msRemaining: next.msRemaining,
  });
});
