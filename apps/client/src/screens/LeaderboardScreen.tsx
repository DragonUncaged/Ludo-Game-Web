import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { API_URL } from '../lib/api';

interface LeaderboardEntry {
  id: number;
  nickname: string;
  wins: number;
  gamesPlayed: number;
  coinBalance: number;
  capturesMade: number;
  hasEquippedCosmetic: boolean;
}

export default function LeaderboardScreen() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_URL}/leaderboard?limit=50`);
        if (!response.ok) throw new Error('Failed to fetch leaderboard');
        const data = (await response.json()) as LeaderboardEntry[];
        setEntries(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];

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

      <header className="relative z-10 mb-8 w-full max-w-md">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-4xl font-extrabold text-ink-light">Leaderboard</h1>
          <button
            onClick={() => navigate('/')}
            className="clay cursor-pointer rounded-full px-3 py-2 font-body text-sm font-bold text-ink-light active:clay-pressed"
          >
            ← Back
          </button>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-md">
        {loading && (
          <div className="clay bg-board-light p-8 text-center font-bold opacity-60">
            Loading leaderboard...
          </div>
        )}

        {error && (
          <div className="clay bg-clay-red/90 px-4 py-3 text-center font-bold text-white">{error}</div>
        )}

        {!loading && !error && entries.length === 0 && (
          <div className="clay bg-board-light p-8 text-center font-bold opacity-60">No players yet</div>
        )}

        {!loading && !error && entries.length > 0 && (
          <div className="clay bg-board-light p-5 space-y-2">
            {entries.map((entry, idx) => (
              <div
                key={entry.id}
                className="clay-pressed flex items-center gap-3 rounded-2xl bg-seg-light px-4 py-3"
              >
                <span className="w-8 text-lg font-extrabold text-center">{MEDALS[idx] ?? `#${idx + 1}`}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-extrabold text-ink-light truncate flex items-center gap-2">
                    {entry.nickname}
                    {entry.hasEquippedCosmetic && <span>✨</span>}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-ink-light opacity-60">
                    <span>🏆 {entry.wins}W</span>
                    <span>🎮 {entry.gamesPlayed}G</span>
                    <span>💰 {entry.coinBalance}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
