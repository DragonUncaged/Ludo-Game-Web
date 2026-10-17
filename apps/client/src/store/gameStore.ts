import { create } from 'zustand';
import type { RankingEntry } from '@ludo/shared';

export interface GamePlayer {
  sessionId: string;
  nickname: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  finishedRank: number;
  tokens: number[];
  coinBalance: number;
  acceptedBet: boolean;
  staked: boolean;
  forfeitedBet: boolean;
  equippedCharacter: string;
}

export interface GameSnap {
  roomPhase: 'waiting' | 'playing' | 'ended';
  joinCode: string;
  hostSessionId: string;
  players: GamePlayer[];
  currentPlayer: number;
  turnPhase: string;
  dice: number;
  turnSeconds: number;
  turnDeadline: number;
  diceMode: 'fair' | 'dynamic';
  betAmount: number;
  bettingStatus: 'not_started' | 'in_progress' | 'accepted';
}

/** Animation override for one token: where to RENDER it (instead of truePos) and how. */
export interface TokenOverride {
  r: number;
  c: number;
  anim: 'hop' | 'fly' | null;
}

export interface Poof {
  id: number;
  r: number;
  c: number;
}

interface GameStore {
  snap: GameSnap | null;
  mySessionId: string;
  /** tokens my client may tap right now (set by diceRolled for my seat) */
  legalTokens: number[];
  clockOffset: number;
  ranking: RankingEntry[] | null;
  /** dice value being shown (survives the schema reset between turns) */
  shownDice: number;
  rolling: boolean;
  /** `${seat}-${token}` → render override; only the animation queue writes these */
  overrides: Record<string, TokenOverride>;
  poofs: Poof[];
  applySnap: (snap: GameSnap) => void;
  setMySessionId: (id: string) => void;
  setLegalTokens: (t: number[]) => void;
  setClockOffset: (o: number) => void;
  setRanking: (r: RankingEntry[] | null) => void;
  setShownDice: (v: number) => void;
  setRolling: (r: boolean) => void;
  setOverride: (key: string, o: TokenOverride | null) => void;
  clearOverrides: () => void;
  addPoof: (p: Poof) => void;
  removePoof: (id: number) => void;
  reset: () => void;
}

export const useGame = create<GameStore>((set) => ({
  snap: null,
  mySessionId: '',
  legalTokens: [],
  clockOffset: 0,
  ranking: null,
  shownDice: 0,
  rolling: false,
  overrides: {},
  poofs: [],
  applySnap: (snap) => set({ snap }),
  setMySessionId: (mySessionId) => set({ mySessionId }),
  setLegalTokens: (legalTokens) => set({ legalTokens }),
  setClockOffset: (clockOffset) => set({ clockOffset }),
  setRanking: (ranking) => set({ ranking }),
  setShownDice: (shownDice) => set({ shownDice }),
  setRolling: (rolling) => set({ rolling }),
  setOverride: (key, o) =>
    set((s) => {
      const overrides = { ...s.overrides };
      if (o) overrides[key] = o;
      else delete overrides[key];
      return { overrides };
    }),
  clearOverrides: () => set({ overrides: {} }),
  addPoof: (p) => set((s) => ({ poofs: [...s.poofs, p] })),
  removePoof: (id) => set((s) => ({ poofs: s.poofs.filter((p) => p.id !== id) })),
  reset: () =>
    set({
      snap: null,
      legalTokens: [],
      ranking: null,
      shownDice: 0,
      rolling: false,
      overrides: {},
      poofs: [],
    }),
}));

export function mySeat(store: { snap: GameSnap | null; mySessionId: string }): number {
  if (!store.snap) return -1;
  return store.snap.players.findIndex((p) => p.sessionId === store.mySessionId);
}
