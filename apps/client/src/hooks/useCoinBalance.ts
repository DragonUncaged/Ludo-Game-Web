import { useState, useEffect } from 'react';

// Coins live on the API service, not the realtime one — pointing this at the
// Colyseus host made every balance 404 and render as 0.
const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

export interface CoinBalanceData {
  balance: number;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useCoinBalance(deviceToken: string | null, autoRefreshMs = 30000): CoinBalanceData {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = async () => {
    if (!deviceToken) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await fetch(`${API_URL}/coins/${deviceToken}/balance`);
      if (!res.ok) {
        if (res.status === 404) {
          setBalance(null);
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } else {
        const data = (await res.json()) as { balance: number };
        setBalance(data.balance);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load balance');
      setBalance(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBalance();

    // Auto-refresh interval
    if (autoRefreshMs > 0) {
      const interval = setInterval(fetchBalance, autoRefreshMs);
      return () => clearInterval(interval);
    }
  }, [deviceToken, autoRefreshMs]);

  return { balance: balance ?? 0, loading, error, refetch: fetchBalance };
}
