import { useState, useEffect } from 'react';

const WS_URL: string = import.meta.env.VITE_WS_URL ?? 'ws://localhost:2567';
const HTTP_URL = WS_URL.replace(/^ws/, 'http');

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
      const res = await fetch(`${HTTP_URL}/coins/${deviceToken}/balance`);
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
