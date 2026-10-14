import { create } from 'zustand';
import type { AuthResponse, AuthTokens, MeResponse, Permission, PublicSettings, UserDTO } from '@nboard/shared';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { secure } from '../lib/storage';
import { apiBase, useServer } from './server';
import { queryClient } from '../lib/query';
import { ApiClientError, request } from '../lib/api';

const REFRESH_KEY = 'nboard.refresh';

type Status = 'booting' | 'signedOut' | 'signedIn';

interface AuthState {
  status: Status;
  user: UserDTO | null;
  permissions: Permission[];
  mustChange: boolean;
  player: MeResponse['player'];
  settings: PublicSettings | null;
  accessToken: string | null;
  refreshToken: string | null;
  /** Shown once on the login screen, for example after an idle sign-out */
  notice: string | null;

  boot(): Promise<void>;
  login(loginId: string, secret: string): Promise<void>;
  refresh(): Promise<boolean>;
  loadMe(): Promise<void>;
  applyAuth(r: AuthResponse): Promise<void>;
  applyTokens(t: AuthTokens): Promise<void>;
  logout(all?: boolean): Promise<void>;
  /** The server said the session is over (revoked, deactivated). */
  expire(message?: string): void;
  flagMustChange(): void;
  setNotice(n: string | null): void;
}

let refreshing: Promise<boolean> | null = null;

function reset(set: (s: Partial<AuthState>) => void, notice: string | null = null) {
  set({ status: 'signedOut', user: null, permissions: [], mustChange: false, player: null, accessToken: null, refreshToken: null, notice });
  queryClient.clear();
}

const deviceLabel = () => Device.deviceName ?? Device.modelName ?? (Platform.OS === 'web' ? 'Web browser' : Platform.OS);

export const useAuth = create<AuthState>((set, get) => ({
  status: 'booting',
  user: null,
  permissions: [],
  mustChange: false,
  player: null,
  settings: null,
  accessToken: null,
  refreshToken: null,
  notice: null,

  async boot() {
    const rt = await secure.get(REFRESH_KEY);
    if (!rt || !useServer.getState().url) return set({ status: 'signedOut', refreshToken: null });
    set({ refreshToken: rt });
    const ok = await get().refresh();
    if (!ok) {
      // A network failure keeps the token for next time; a rejected token was already cleared by refresh().
      return set({ status: 'signedOut' });
    }
    try {
      await get().loadMe();
    } catch {
      set({ status: 'signedOut' });
    }
  },

  async login(loginId, secret) {
    const res = await fetch(`${apiBase()}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ login_id: loginId.trim(), secret, device_label: deviceLabel(), platform: Platform.OS }),
    }).catch(() => null);
    if (!res) throw new ApiClientError('NETWORK', 0, 'Cannot reach the server. Check the Wi-Fi and the address.');
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = data?.error;
      throw new ApiClientError(e?.code ?? 'UNKNOWN', res.status, e?.message ?? 'Sign-in failed.', e?.details);
    }
    await get().applyAuth(data as AuthResponse);
    await get().loadMe().catch(() => {});
  },

  async applyAuth(r) {
    await secure.set(REFRESH_KEY, r.refresh_token);
    set({
      status: 'signedIn',
      accessToken: r.access_token,
      refreshToken: r.refresh_token,
      user: r.user,
      permissions: r.permissions,
      mustChange: r.must_change_password,
      notice: null,
    });
  },

  async applyTokens(t) {
    await secure.set(REFRESH_KEY, t.refresh_token);
    set({ accessToken: t.access_token, refreshToken: t.refresh_token });
  },

  async loadMe() {
    const me = await request<MeResponse>('GET', '/me');
    set({
      status: 'signedIn',
      user: me.user,
      permissions: me.permissions,
      mustChange: me.must_change_password,
      player: me.player,
      settings: me.settings,
    });
  },

  refresh() {
    // One refresh at a time: the refresh token rotates, so two in flight would revoke the session.
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const rt = get().refreshToken;
      if (!rt) return false;
      try {
        const res = await fetch(`${apiBase()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: rt }),
        });
        if (res.status === 401) {
          await secure.del(REFRESH_KEY);
          set({ refreshToken: null, accessToken: null });
          return false;
        }
        if (!res.ok) return false;
        await get().applyTokens((await res.json()) as AuthTokens);
        return true;
      } catch {
        return false; // offline: keep the token
      }
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  },

  async logout(all = false) {
    const token = get().accessToken;
    if (token) {
      await fetch(`${apiBase()}/auth/logout${all ? '?all=1' : ''}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    await secure.del(REFRESH_KEY);
    reset(set);
  },

  expire(message) {
    void secure.del(REFRESH_KEY);
    reset(set, message ?? 'You were signed out. Please sign in again.');
  },

  flagMustChange() {
    set({ mustChange: true });
  },

  setNotice(n) {
    set({ notice: n });
  },
}));

export const useCan = () => {
  const permissions = useAuth((s) => s.permissions);
  const role = useAuth((s) => s.user?.role);
  return (p: Permission) => !!role && permissions.includes(p);
};
