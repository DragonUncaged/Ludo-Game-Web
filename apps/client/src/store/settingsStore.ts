import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type TokenStyle = 'clay' | '2d';
export type Theme = 'light' | 'dark';

interface SettingsState {
  nickname: string;
  deviceToken: string;
  theme: Theme;
  tokenStyle: TokenStyle;
  soundOn: boolean;
  setNickname: (n: string) => void;
  setTheme: (t: Theme) => void;
  setTokenStyle: (s: TokenStyle) => void;
  setSoundOn: (on: boolean) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      nickname: '',
      deviceToken: crypto.randomUUID(),
      theme: 'light',
      tokenStyle: 'clay',
      soundOn: true,
      setNickname: (nickname) => set({ nickname }),
      setTheme: (theme) => set({ theme }),
      setTokenStyle: (tokenStyle) => set({ tokenStyle }),
      setSoundOn: (soundOn) => set({ soundOn }),
    }),
    { name: 'ludo-settings' }
  )
);
