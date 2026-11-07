import { Router } from 'express';
import {
  equipCosmeticAtomic,
  getCosmeticById,
  getCosmeticsTransactionHistory,
  getPlayerCosmeticsEquipped,
  getPlayerCosmeticsOwned,
  getShopCosmeticsFiltered,
  getStatsByDeviceToken,
  purchaseCosmeticAtomic,
} from '@ludo/db';
import type { PurchaseError } from '@ludo/db';
import { limitParam, validateDeviceToken } from '../http.js';

export const shop = Router();
validateDeviceToken(shop);

const PURCHASE_ERRORS: Record<PurchaseError, { status: number; message: string }> = {
  cosmetic_not_found: { status: 404, message: 'This item does not exist or is no longer for sale' },
  already_owned: { status: 400, message: 'You already own this item' },
  insufficient_coins: { status: 400, message: 'Not enough coins' },
  user_not_found: { status: 404, message: 'Player not found' },
};

shop.get('/shop/cosmetics', async (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json({ cosmetics: await getShopCosmeticsFiltered(category) });
});

shop.get('/guests/:deviceToken/cosmetics', async (req, res) => {
  const { deviceToken } = req.params;
  const [owned, stats] = await Promise.all([
    getPlayerCosmeticsOwned(deviceToken),
    getStatsByDeviceToken(deviceToken),
  ]);
  if (!stats) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  res.json({ owned, coin_balance: stats.coin_balance });
});

shop.get('/guests/:deviceToken/cosmetics/equipped', async (req, res) => {
  res.json({ equipped: await getPlayerCosmeticsEquipped(req.params.deviceToken) });
});

shop.get('/guests/:deviceToken/cosmetics/history', async (req, res) => {
  const limit = limitParam(req.query.limit, 20, 100);
  res.json({ purchases: await getCosmeticsTransactionHistory(req.params.deviceToken, limit) });
});

shop.post('/guests/:deviceToken/cosmetics/purchase', async (req, res) => {
  const cosmeticId: unknown = req.body?.cosmetic_id;
  if (typeof cosmeticId !== 'string' || !cosmeticId.trim()) {
    res.status(400).json({ error: 'BAD_REQUEST' });
    return;
  }

  const [stats, cosmetic] = await Promise.all([
    getStatsByDeviceToken(req.params.deviceToken),
    getCosmeticById(cosmeticId),
  ]);
  if (!stats) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }

  const result = await purchaseCosmeticAtomic(Number(stats.id), cosmeticId);
  if (!result.ok) {
    const { status, message } = PURCHASE_ERRORS[result.error];
    res.status(status).json({ success: false, error: result.error, message });
    return;
  }

  res.json({
    success: true,
    message: `${cosmetic?.name ?? 'Item'} purchased`,
    cosmetic: cosmetic && { id: cosmetic.id, name: cosmetic.name, category: cosmetic.category },
    new_balance: result.newBalance,
  });
});

shop.patch('/guests/:deviceToken/cosmetics/:cosmeticId/equip', async (req, res) => {
  const { deviceToken, cosmeticId } = req.params;
  const stats = await getStatsByDeviceToken(deviceToken);
  if (!stats) {
    res.status(404).json({ error: 'NOT_FOUND' });
    return;
  }
  if (!(await equipCosmeticAtomic(Number(stats.id), cosmeticId))) {
    res.status(403).json({ success: false, error: 'not_owned', message: "You don't own this item" });
    return;
  }
  res.json({ success: true, equipped: await getPlayerCosmeticsEquipped(deviceToken) });
});
