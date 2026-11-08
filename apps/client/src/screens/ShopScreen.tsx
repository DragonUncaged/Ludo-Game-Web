import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useSettings } from '../store/settingsStore';
import { API_URL } from '../lib/api';

type CosmeticCategory = 'character' | 'dice' | 'board' | 'emote';

interface Cosmetic {
  id: string;
  category: CosmeticCategory;
  name: string;
  description: string;
  price: number;
  thumbnailUrl?: string;
  rarity: string;
  available: boolean;
}

interface PlayerCosmetic extends Cosmetic {
  owned: boolean;
  equipped: boolean;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export default function ShopScreen() {
  const navigate = useNavigate();
  const { deviceToken } = useSettings();
  const [selectedCategory, setSelectedCategory] = useState<CosmeticCategory>('character');
  const [cosmetics, setCosmetics] = useState<PlayerCosmetic[]>([]);
  const [coinBalance, setCoinBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<string | null>(null);

  const load = useCallback(
    async (category: CosmeticCategory) => {
      setLoading(true);
      setError(null);
      try {
        const [wallet, shop, owned, equipped] = await Promise.all([
          getJson<{ balance: number }>(`${API_URL}/coins/${deviceToken}/balance`),
          getJson<{ cosmetics: Cosmetic[] }>(`${API_URL}/shop/cosmetics?category=${category}`),
          getJson<{ owned: Cosmetic[] }>(`${API_URL}/guests/${deviceToken}/cosmetics`),
          getJson<{ equipped: Record<string, Cosmetic | null> }>(
            `${API_URL}/guests/${deviceToken}/cosmetics/equipped`
          ),
        ]);
        const ownedIds = new Set(owned.owned.map((c) => c.id));
        const equippedIds = new Set(Object.values(equipped.equipped).flatMap((c) => (c ? [c.id] : [])));
        setCoinBalance(wallet.balance);
        setCosmetics(
          shop.cosmetics.map((c) => ({ ...c, owned: ownedIds.has(c.id), equipped: equippedIds.has(c.id) }))
        );
      } catch {
        setError('Could not load the shop. Play a game first to open your wallet.');
      } finally {
        setLoading(false);
      }
    },
    [deviceToken]
  );

  useEffect(() => {
    void load(selectedCategory);
  }, [load, selectedCategory]);

  const handlePurchase = async (cosmeticId: string) => {
    setPurchasing(cosmeticId);
    try {
      const res = await fetch(`${API_URL}/guests/${deviceToken}/cosmetics/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmetic_id: cosmeticId }),
      });
      const data = (await res.json()) as { message?: string; new_balance?: number };
      if (!res.ok) {
        setError(data.message ?? 'Purchase failed');
        return;
      }
      if (typeof data.new_balance === 'number') setCoinBalance(data.new_balance);
      setCosmetics((list) => list.map((c) => (c.id === cosmeticId ? { ...c, owned: true } : c)));
      setError(null);
    } catch {
      setError('Purchase failed');
    } finally {
      setPurchasing(null);
    }
  };

  const handleEquip = async (cosmeticId: string) => {
    setEquipping(cosmeticId);
    try {
      const res = await fetch(`${API_URL}/guests/${deviceToken}/cosmetics/${cosmeticId}/equip`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        setError(data.message ?? 'Equip failed');
        return;
      }
      setCosmetics((list) => {
        const category = list.find((c) => c.id === cosmeticId)?.category;
        return list.map((c) => (c.category === category ? { ...c, equipped: c.id === cosmeticId } : c));
      });
      setError(null);
    } catch {
      setError('Equip failed');
    } finally {
      setEquipping(null);
    }
  };

  const rarityColor = (rarity: string) => {
    switch (rarity) {
      case 'epic':
        return 'text-purple-600 font-bold';
      case 'rare':
        return 'text-blue-600 font-bold';
      case 'uncommon':
        return 'text-green-600 font-bold';
      default:
        return 'text-gray-600';
    }
  };

  const getCategoryIcon = (cat: CosmeticCategory) => {
    switch (cat) {
      case 'character':
        return '👤';
      case 'dice':
        return '🎲';
      case 'board':
        return '🎯';
      case 'emote':
        return '😊';
      default:
        return '✨';
    }
  };

  const categories: CosmeticCategory[] = ['character', 'dice', 'board', 'emote'];

  return (
    <div
      className="relative flex min-h-screen flex-col items-center overflow-hidden px-5 py-10"
      style={{ background: 'linear-gradient(160deg,#ffe9f0,#e9f1ff,#eafff2)' }}
    >
      <div
        className="pointer-events-none absolute -left-20 -top-28 h-[380px] w-[380px] rounded-full opacity-60 blur-[60px]"
        style={{ background: '#ffc7d9', animation: 'drift-a 14s ease-in-out infinite' }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 -right-24 h-[420px] w-[420px] rounded-full opacity-55 blur-[70px]"
        style={{ background: '#bfe0ff', animation: 'drift-b 17s ease-in-out infinite' }}
      />

      <div className="relative z-10 w-full max-w-4xl">
        <header className="mb-8 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="clay cursor-pointer rounded-2xl border-0 bg-clay-blue px-4 py-2 font-body text-sm font-bold text-white active:clay-pressed"
          >
            ← Back
          </button>
          <h1 className="font-display text-3xl font-extrabold text-ink-light">Cosmetics Shop</h1>
          <div className="flex items-center gap-2 rounded-full bg-white/40 px-4 py-2 backdrop-blur-sm">
            <span className="text-xl">💰</span>
            <span className="font-display font-extrabold text-ink-light">{coinBalance}</span>
          </div>
        </header>

        <div className="clay mb-8 flex flex-wrap gap-2 rounded-2xl bg-board-light p-4 lg:gap-3">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`clay rounded-xl px-4 py-2 font-body text-sm font-bold transition-all ${
                selectedCategory === cat
                  ? 'bg-clay-yellow text-[#7a5b18] clay-pressed'
                  : 'bg-seg-light text-ink-light opacity-60 hover:opacity-100'
              }`}
            >
              {getCategoryIcon(cat)} {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {error && (
          <div className="clay mb-6 rounded-2xl bg-clay-red/90 px-4 py-3 text-center font-bold text-white">
            {error}
          </div>
        )}

        {loading && (
          <div className="clay flex items-center justify-center rounded-2xl bg-board-light py-12">
            <p className="font-body text-lg font-bold opacity-60">Loading cosmetics...</p>
          </div>
        )}

        {!loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cosmetics.map((cosmetic) => (
              <div
                key={cosmetic.id}
                className="clay rounded-2xl bg-board-light p-4 transition-all hover:shadow-lg"
              >
                <div className="clay-pressed mb-3 flex h-32 items-center justify-center rounded-xl bg-seg-light">
                  {cosmetic.thumbnailUrl ? (
                    <img
                      src={cosmetic.thumbnailUrl}
                      alt={cosmetic.name}
                      className="h-full w-full object-cover rounded-lg"
                    />
                  ) : (
                    <span className="text-4xl">{getCategoryIcon(cosmetic.category)}</span>
                  )}
                </div>

                <h3 className="font-display text-lg font-bold text-ink-light">{cosmetic.name}</h3>
                <p className={`text-xs ${rarityColor(cosmetic.rarity)} mb-2`}>
                  {cosmetic.rarity.toUpperCase()}
                </p>

                <p className="mb-3 text-xs font-bold text-ink-light opacity-70">{cosmetic.description}</p>

                {cosmetic.price === 0 ? (
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-clay-green/20 px-2 py-1">
                    <span className="text-xs font-bold text-[#2c6b3d]">Free</span>
                  </div>
                ) : (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="text-xl">💰</span>
                    <span className="font-display font-bold text-ink-light">{cosmetic.price}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  {!cosmetic.owned ? (
                    <button
                      onClick={() => handlePurchase(cosmetic.id)}
                      disabled={cosmetic.price > coinBalance || purchasing !== null || !cosmetic.available}
                      className="flex-1 clay cursor-pointer rounded-xl border-0 bg-clay-yellow py-2 font-body text-sm font-bold text-[#7a5b18] active:clay-pressed disabled:opacity-50"
                    >
                      {purchasing === cosmetic.id ? 'Buying...' : 'Buy'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEquip(cosmetic.id)}
                      disabled={equipping !== null}
                      className={`flex-1 clay rounded-xl border-0 py-2 font-body text-sm font-bold transition-all ${
                        cosmetic.equipped
                          ? 'bg-clay-green text-[#2c6b3d] clay-pressed'
                          : 'bg-seg-light text-ink-light hover:bg-clay-green/50 cursor-pointer active:clay-pressed'
                      }`}
                    >
                      {equipping === cosmetic.id
                        ? 'Equipping...'
                        : cosmetic.equipped
                          ? '✓ Equipped'
                          : 'Equip'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && cosmetics.length === 0 && (
          <div className="clay flex flex-col items-center justify-center rounded-2xl bg-board-light py-12">
            <p className="text-2xl mb-2">📭</p>
            <p className="font-body text-lg font-bold opacity-60">No cosmetics in this category</p>
          </div>
        )}
      </div>
    </div>
  );
}
