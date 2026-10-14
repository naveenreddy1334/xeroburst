import { useEffect, useRef, useState } from 'react';
import { AppState, Platform, View, useColorScheme } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import { queryClient } from '../lib/query';
import { useAuth } from '../state/auth';
import { useServer } from '../state/server';
import { usePrefs } from '../state/prefs';
import { useRun } from '../state/ui';
import { flushOutbox, refreshOutboxCount } from '../lib/outbox';
import { ToastHost } from '../ui/Toast';
import { Logo } from '../ui/Logo';
import { C, setThemeMode } from '../theme/tokens';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function useHydrated() {
  const [prefs, setPrefs] = useState(usePrefs.persist.hasHydrated());
  const [server, setServer] = useState(useServer.persist.hasHydrated());
  useEffect(() => {
    const a = usePrefs.persist.onFinishHydration(() => setPrefs(true));
    const b = useServer.persist.onFinishHydration(() => setServer(true));
    setPrefs(usePrefs.persist.hasHydrated());
    setServer(useServer.persist.hasHydrated());
    return () => {
      a();
      b();
    };
  }, []);
  return prefs && server;
}

/** Signs out after the idle time from Settings. Paused while a round runs. */
function IdleGuard() {
  const status = useAuth((s) => s.status);
  const minutes = useAuth((s) => s.settings?.idle_timeout_min ?? 15);
  const last = useRef(Date.now());
  const path = usePathname();
  useEffect(() => {
    last.current = Date.now();
  }, [path]);
  useEffect(() => {
    if (status !== 'signedIn') return;
    last.current = Date.now();
    const t = setInterval(() => {
      if (useRun.getState().playing) {
        last.current = Date.now();
        return;
      }
      if (Date.now() - last.current > minutes * 60_000) {
        void useAuth.getState().logout().then(() => useAuth.getState().setNotice('You were signed out because the app was idle.'));
      }
    }, 15_000);
    return () => clearInterval(t);
  }, [status, minutes]);
  useEffect(() => {
    const bump = () => (last.current = Date.now());
    if (Platform.OS === 'web') {
      const ev = ['pointerdown', 'keydown', 'wheel'] as const;
      ev.forEach((e) => globalThis.addEventListener?.(e, bump));
      return () => ev.forEach((e) => globalThis.removeEventListener?.(e, bump));
    }
  }, []);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold });
  const hydrated = useHydrated();
  const themePref = usePrefs((s) => s.theme);
  const system = useColorScheme();
  const mode = themePref === 'system' ? (system === 'light' ? 'light' : 'dark') : themePref;
  // Set before any child renders; the key below remounts the tree when the theme changes so every screen re-reads C.
  setThemeMode(mode);
  const status = useAuth((s) => s.status);
  const mustChange = useAuth((s) => s.mustChange);
  const url = useServer((s) => s.url);
  const booted = useRef(false);

  useEffect(() => {
    if (!hydrated || booted.current) return;
    booted.current = true;
    void useAuth.getState().boot().then(() => {
      void refreshOutboxCount();
    });
  }, [hydrated]);

  useEffect(() => {
    if (status === 'signedIn') void flushOutbox().catch(() => {});
  }, [status]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && useAuth.getState().status === 'signedIn') void flushOutbox().catch(() => {});
    });
    return () => sub.remove();
  }, []);

  const ready = (fontsLoaded || !!fontError) && hydrated && status !== 'booting';
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Logo size={96} animated />
      </View>
    );
  }

  const signedIn = status === 'signedIn';
  return (
    <GestureHandlerRootView key={mode} style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Protected guard={!url}>
              <Stack.Screen name="connect" />
            </Stack.Protected>
            <Stack.Protected guard={!!url && !signedIn}>
              <Stack.Screen name="login" />
              <Stack.Screen name="forgot" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn && mustChange}>
              <Stack.Screen name="change-password" />
            </Stack.Protected>
            <Stack.Protected guard={signedIn && !mustChange}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
          <IdleGuard />
          <ToastHost />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
