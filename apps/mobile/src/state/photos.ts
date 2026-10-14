// Profile photos picked on this device. They are kept here only (no upload), keyed by NB code or login ID.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface Photos {
  map: Record<string, string>;
  set: (key: string, uri: string) => void;
}

export const usePhotos = create<Photos>()(
  persist(
    (set) => ({ map: {}, set: (key, uri) => set((s) => ({ map: { ...s.map, [key.toUpperCase()]: uri } })) }),
    { name: 'xeroburst.photos', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

export const usePhoto = (key?: string | null) => usePhotos((s) => (key ? s.map[key.toUpperCase()] : undefined));
