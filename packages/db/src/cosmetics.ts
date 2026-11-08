import { getPool, withTransaction } from './pool.js';

export interface CosmeticItem {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: number;
  thumbnailUrl: string | null;
  rarity: string;
  available: boolean;
}

interface CosmeticRow {
  id: string;
  category: string;
  name: string;
  description: string | null;
  price: string;
  thumbnail_url: string | null;
  rarity: string;
  available: boolean;
}

const COSMETIC_COLUMNS =
  'c.id, c.category, c.name, c.description, c.price, c.thumbnail_url, c.rarity, c.available';

function toCosmetic(row: CosmeticRow): CosmeticItem {
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    thumbnailUrl: row.thumbnail_url,
    rarity: row.rarity,
    available: row.available,
  };
}

export async function getShopCosmeticsFiltered(category?: string): Promise<CosmeticItem[]> {
  const res = await getPool().query<CosmeticRow>(
    `SELECT ${COSMETIC_COLUMNS} FROM cosmetics c
     WHERE c.available AND ($1::text IS NULL OR c.category = $1)
     ORDER BY c.category, c.price`,
    [category ?? null]
  );
  return res.rows.map(toCosmetic);
}

export async function getCosmeticById(cosmeticId: string): Promise<CosmeticItem | null> {
  const res = await getPool().query<CosmeticRow>(
    `SELECT ${COSMETIC_COLUMNS} FROM cosmetics c WHERE c.id = $1`,
    [cosmeticId]
  );
  return res.rows[0] ? toCosmetic(res.rows[0]) : null;
}

export interface PlayerCosmeticOwned {
  id: string;
  category: string;
  name: string;
  thumbnailUrl: string | null;
  price: number;
  rarity: string;
  isEquipped: boolean;
  ownedSince: string;
}

export async function getPlayerCosmeticsOwned(deviceToken: string): Promise<PlayerCosmeticOwned[]> {
  const res = await getPool().query<CosmeticRow & { is_equipped: boolean; owned_since: string }>(
    `SELECT ${COSMETIC_COLUMNS}, pc.is_equipped, pc.owned_since
     FROM guest_users u
     JOIN player_cosmetics pc ON pc.user_id = u.id
     JOIN cosmetics c ON c.id = pc.cosmetic_id
     WHERE u.device_token = $1
     ORDER BY c.category, c.price`,
    [deviceToken]
  );
  return res.rows.map((row) => ({
    id: row.id,
    category: row.category,
    name: row.name,
    thumbnailUrl: row.thumbnail_url,
    price: Number(row.price),
    rarity: row.rarity,
    isEquipped: row.is_equipped,
    ownedSince: row.owned_since,
  }));
}

export interface PlayerEquippedCosmeticsByCategory {
  character: CosmeticItem | null;
  dice: CosmeticItem | null;
  board: CosmeticItem | null;
  emote: CosmeticItem | null;
}

export async function getPlayerCosmeticsEquipped(
  deviceToken: string
): Promise<PlayerEquippedCosmeticsByCategory> {
  const res = await getPool().query<CosmeticRow>(
    `SELECT ${COSMETIC_COLUMNS}
     FROM guest_users u
     JOIN player_cosmetics pc ON pc.user_id = u.id
     JOIN cosmetics c ON c.id = pc.cosmetic_id
     WHERE u.device_token = $1 AND pc.is_equipped`,
    [deviceToken]
  );
  const equipped: PlayerEquippedCosmeticsByCategory = {
    character: null,
    dice: null,
    board: null,
    emote: null,
  };
  for (const row of res.rows) {
    equipped[row.category as keyof PlayerEquippedCosmeticsByCategory] = toCosmetic(row);
  }
  return equipped;
}

export async function getCosmeticsTransactionHistory(
  deviceToken: string,
  limit = 20
): Promise<Array<{ id: string; name: string; price: number; purchasedAt: string }>> {
  const res = await getPool().query<{ id: string; name: string; price: string; purchased_at: string }>(
    `SELECT c.id, c.name, ct.price, ct.purchased_at
     FROM guest_users u
     JOIN cosmetics_transactions ct ON ct.user_id = u.id
     JOIN cosmetics c ON c.id = ct.cosmetic_id
     WHERE u.device_token = $1
     ORDER BY ct.purchased_at DESC
     LIMIT $2`,
    [deviceToken, limit]
  );
  return res.rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: Number(row.price),
    purchasedAt: row.purchased_at,
  }));
}

export type PurchaseError = 'cosmetic_not_found' | 'already_owned' | 'insufficient_coins' | 'user_not_found';
export type PurchaseResult = { ok: true; newBalance: number } | { ok: false; error: PurchaseError };

export async function purchaseCosmeticAtomic(userId: number, cosmeticId: string): Promise<PurchaseResult> {
  return withTransaction<PurchaseResult>(async (client) => {
    const item = await client.query<{ price: string }>(
      `SELECT price FROM cosmetics WHERE id = $1 AND available`,
      [cosmeticId]
    );
    if (!item.rows[0]) return { ok: false, error: 'cosmetic_not_found' };
    const price = Number(item.rows[0].price);

    const owned = await client.query(
      `SELECT 1 FROM player_cosmetics WHERE user_id = $1 AND cosmetic_id = $2`,
      [userId, cosmeticId]
    );
    if (owned.rowCount) return { ok: false, error: 'already_owned' };

    // Row lock, so a payout or bonus landing mid-purchase isn't overwritten by our write.
    const wallet = await client.query<{ coin_balance: string }>(
      `SELECT coin_balance FROM guest_users WHERE id = $1 FOR UPDATE`,
      [userId]
    );
    if (!wallet.rows[0]) return { ok: false, error: 'user_not_found' };
    const balance = Number(wallet.rows[0].coin_balance);
    if (balance < price) return { ok: false, error: 'insufficient_coins' };

    const newBalance = balance - price;
    await client.query(`UPDATE guest_users SET coin_balance = $2 WHERE id = $1`, [userId, newBalance]);
    await client.query(
      `INSERT INTO player_cosmetics (user_id, cosmetic_id, is_equipped) VALUES ($1, $2, false)`,
      [userId, cosmeticId]
    );
    await client.query(
      `INSERT INTO cosmetics_transactions (user_id, cosmetic_id, price) VALUES ($1, $2, $3)`,
      [userId, cosmeticId, price]
    );
    return { ok: true, newBalance };
  });
}

/** Equips an owned item and unequips whatever else was worn in its category. False if not owned. */
export async function equipCosmeticAtomic(userId: number, cosmeticId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    const owned = await client.query<{ category: string }>(
      `SELECT c.category FROM player_cosmetics pc
       JOIN cosmetics c ON c.id = pc.cosmetic_id
       WHERE pc.user_id = $1 AND pc.cosmetic_id = $2`,
      [userId, cosmeticId]
    );
    const category = owned.rows[0]?.category;
    if (!category) return false;

    await client.query(
      `UPDATE player_cosmetics pc SET is_equipped = (pc.cosmetic_id = $2)
       FROM cosmetics c
       WHERE c.id = pc.cosmetic_id AND pc.user_id = $1 AND c.category = $3`,
      [userId, cosmeticId, category]
    );
    return true;
  });
}
