import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/** Normalises what a person types: adds http://, trims slashes. Returns null if it cannot be an address. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  // A scanned code may carry the address in a longer link, e.g. http://192.168.1.20:8080/status
  const m = s.match(/^(?:https?:\/\/)?([A-Za-z0-9.-]+|\[[0-9a-f:]+\])(?::(\d{1,5}))?(?:\/.*)?$/i);
  if (!m) return null;
  const host = m[1]!;
  const port = m[2];
  const scheme = /^https:\/\//i.test(s) ? 'https' : 'http';
  s = `${scheme}://${host}${port ? ':' + port : host.includes('.') || host === 'localhost' ? ':8080' : ''}`;
  return s.replace(/\/+$/, '');
}

interface ServerState {
  url: string | null;
  recent: string[];
  hydrated: boolean;
  setUrl: (u: string | null) => void;
}

export const useServer = create<ServerState>()(
  persist(
    (set, get) => ({
      url: null,
      recent: [],
      hydrated: false,
      setUrl: (u) =>
        set({ url: u, recent: u ? [u, ...get().recent.filter((x) => x !== u)].slice(0, 4) : get().recent }),
    }),
    {
      name: 'nboard.server',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ url: s.url, recent: s.recent }),
      onRehydrateStorage: () => () => useServer.setState({ hydrated: true }),
    },
  ),
);

export const apiBase = () => `${useServer.getState().url ?? ''}/api/v1`;
