import { useCallback, useEffect, useState } from 'react';
import { DAILY_BONUS_COOLDOWN_MS } from '@ludo/shared';
import { API_URL } from '../lib/api';

export interface DailyBonusState {
  /** False until the player has a wallet (no guest row yet) — hide the button. */
  available: boolean;
  claimable: boolean;
  /** Coins a claim would pay right now. */
  amount: number;
  msRemaining: number;
  loading: boolean;
  claiming: boolean;
  /** Amount just claimed, for the celebratory toast; cleared by the caller. */
  lastClaimed: number | null;
  error: string | null;
  claim: () => Promise<void>;
  refresh: () => Promise<void>;
}

interface BonusResponse {
  claimable: boolean;
  amount: number;
  msRemaining: number;
}

/**
 * Daily bonus status for the home screen. The server owns both the cooldown and
 * the payout; this only mirrors them and ticks the countdown down locally so the
 * button unlocks without a refresh.
 */
export function useDailyBonus(deviceToken: string, onClaimed?: () => void): DailyBonusState {
  const [status, setStatus] = useState<BonusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [lastClaimed, setLastClaimed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/coins/${deviceToken}/bonus`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus((await res.json()) as BonusResponse);
      setError(null);
    } catch {
      // No guest row yet, so no bonus to show.
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [deviceToken]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Tick the cooldown locally and re-ask the server once it runs out.
  const coolingDown = status !== null && !status.claimable;
  useEffect(() => {
    if (!coolingDown) return;
    const id = setInterval(() => {
      setStatus((s) => (s ? { ...s, msRemaining: Math.max(0, s.msRemaining - 1000) } : s));
    }, 1000);
    return () => clearInterval(id);
  }, [coolingDown]);

  const cooldownOver = coolingDown && status.msRemaining <= 0;
  useEffect(() => {
    if (cooldownOver) void refresh();
  }, [cooldownOver, refresh]);

  const claim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/coins/${deviceToken}/bonus`, { method: 'POST' });
      const data = (await res.json()) as BonusResponse & { claimed?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error === 'ON_COOLDOWN' ? 'Already claimed today' : 'Could not claim bonus');
        setStatus({ claimable: false, amount: 0, msRemaining: data.msRemaining ?? DAILY_BONUS_COOLDOWN_MS });
        return;
      }
      setLastClaimed(data.amount);
      setStatus({ claimable: false, amount: 0, msRemaining: data.msRemaining });
      onClaimed?.();
    } catch {
      setError('Could not claim bonus');
    } finally {
      setClaiming(false);
    }
  }, [deviceToken, claiming, onClaimed]);

  return {
    available: status !== null,
    claimable: status?.claimable ?? false,
    amount: status?.amount ?? 0,
    msRemaining: status?.msRemaining ?? 0,
    loading,
    claiming,
    lastClaimed,
    error,
    claim,
    refresh,
  };
}
