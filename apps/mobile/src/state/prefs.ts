import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type TransportMode = 'auto' | 'ble' | 'bridge' | 'mock';
export type TextSize = 'normal' | 'large';
export type ThemePref = 'system' | 'dark' | 'light';

interface Prefs {
  sound: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  textSize: TextSize;
  /** Appearance: follow the device, or force dark or light */
  theme: ThemePref;
  transportMode: TransportMode;
  lastTransport: 'ble' | 'bridge' | 'mock' | null;
  /** Demo Mode: a bot presses the buttons so you can watch a whole round */
  demoBot: boolean;
  /** Games the user has seen the how-to for (the screen still comes first; Skip appears after the first time) */
  seenHowTo: Record<string, true>;
  /** Preview the TV layout on any device (also ?tv=1 on web) */
  tvPreview: boolean;
  setPref: <K extends keyof Omit<Prefs, 'setPref' | 'markHowTo'>>(k: K, v: Prefs[K]) => void;
  markHowTo: (slug: string) => void;
}

export const usePrefs = create<Prefs>()(
  persist(
    (set) => ({
      sound: true,
      haptics: true,
      reduceMotion: false,
      textSize: 'normal',
      theme: 'system',
      transportMode: 'auto',
      lastTransport: null,
      demoBot: false,
      seenHowTo: {},
      tvPreview: false,
      setPref: (k, v) => set({ [k]: v } as Partial<Prefs>),
      markHowTo: (slug) => set((s) => ({ seenHowTo: { ...s.seenHowTo, [slug]: true } })),
    }),
    { name: 'nboard.prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
