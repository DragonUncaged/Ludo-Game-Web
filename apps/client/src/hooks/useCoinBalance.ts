import { useCallback, useEffect, useState } from 'react';
import { API_URL } from '../lib/api';

export interface CoinBalance {
  balance: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Polls the wallet. A 404 means the guest row doesn't exist yet, which reads as 0.
 * On a network error the last known balance is kept rather than flashing to 0.
 */
export function useCoinBalance(deviceToken: string | null, refreshMs = 30_000): CoinBalance {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!deviceToken) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/coins/${deviceToken}/balance`);
      if (res.status === 404) {
        setBalance(0);
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as { balance: number };
        setBalance(data.balance);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balance');
    } finally {
      setLoading(false);
    }
  }, [deviceToken]);

  useEffect(() => {
    void refetch();
    if (refreshMs <= 0) return;
    const id = setInterval(() => void refetch(), refreshMs);
    return () => clearInterval(id);
  }, [refetch, refreshMs]);

  return { balance, loading, error, refetch };
}
