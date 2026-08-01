import { create } from 'zustand';
import type { Room } from 'colyseus.js';

interface ConnectionStore {
  room: Room | null;
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  setRoom: (room: Room | null) => void;
  setStatus: (s: ConnectionStore['status']) => void;
  setError: (e: string | null) => void;
}

export const useConnection = create<ConnectionStore>((set) => ({
  room: null,
  status: 'idle',
  error: null,
  setRoom: (room) => set({ room, status: room ? 'connected' : 'idle' }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
}));
