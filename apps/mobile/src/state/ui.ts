import { create } from 'zustand';

/** True while a round is running: the idle timer pauses and the navigation hides. */
export const useRun = create<{ playing: boolean; set: (v: boolean) => void }>((set) => ({ playing: false, set: (playing) => set({ playing }) }));

/** Credentials shown once after creating or resetting. Held in memory only, never in a URL or storage. */
export interface ShownCredentials {
  kind: 'player' | 'staff';
  name: string;
  loginId: string;
  secret: string;
  secretLabel: string;
  note?: string;
  back: string;
}
export const useCredentials = create<{ item: ShownCredentials | null; show: (c: ShownCredentials) => void; clear: () => void }>((set) => ({
  item: null,
  show: (item) => set({ item }),
  clear: () => set({ item: null }),
}));
