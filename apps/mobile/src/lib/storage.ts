// Secrets go to the Keychain (iOS) or Keystore (Android) through expo-secure-store.
// On the web there is no secure store, so a browser build falls back to localStorage. That is
// acceptable for the preview and kiosk use of the web build, and is noted in docs/STATUS.md.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const isWeb = Platform.OS === 'web';

export const secure = {
  async get(key: string): Promise<string | null> {
    try {
      if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      if (isWeb) globalThis.localStorage?.setItem(key, value);
      else await SecureStore.setItemAsync(key, value);
    } catch {
      /* storage unavailable: the user will simply sign in again */
    }
  },
  async del(key: string): Promise<void> {
    try {
      if (isWeb) globalThis.localStorage?.removeItem(key);
      else await SecureStore.deleteItemAsync(key);
    } catch {
      /* ignore */
    }
  },
};
