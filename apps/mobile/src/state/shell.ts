import { create } from 'zustand';

/** Search text typed in the top bar. The Players screen reads it. */
export const useSearch = create<{ q: string; set: (q: string) => void }>((set) => ({ q: '', set: (q) => set({ q }) }));

/** The "Last 7 / 14 / 30 days" switch in the top bar. Analytics trend charts use it. */
export const useRange = create<{ days: 7 | 14 | 30; set: (d: 7 | 14 | 30) => void }>((set) => ({ days: 7, set: (days) => set({ days }) }));

/** The player chosen on Analytics or Players; the other screen opens on the same player. */
export const useSelPlayer = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }));

/** Assess: the player the next nBoard round is recorded for. Cleared by Cancel or when the round is saved. */
export const useAssess = create<{ player: { id: string; name: string } | null; set: (p: { id: string; name: string } | null) => void }>((set) => ({ player: null, set: (player) => set({ player }) }));

/** A hub chosen on the Hubs page: the New player and New coach forms open with it already selected. */
export const usePresetHub = create<{ id: string | null; set: (id: string | null) => void }>((set) => ({ id: null, set: (id) => set({ id }) }));