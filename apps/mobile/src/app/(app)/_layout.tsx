import { Platform, View } from 'react-native';
import { Redirect, Stack, ThemeProvider, usePathname } from 'expo-router';
import { useAuth } from '../../state/auth';
import { useDevice } from '../../theme/device';
import { BottomBar, SideRail, TopBar } from '../../ui/Nav';
import { C, getThemeMode } from '../../theme/tokens';
import { Backdrop } from '../../ui/Backdrop';
import { ShellContext } from '../../ui/Screen';

const navTheme = () => ({ dark: getThemeMode() === 'dark', colors: { primary: C.highlight, background: 'transparent', card: 'transparent', text: C.text, border: 'transparent', notification: C.danger }, fonts: { regular: { fontFamily: 'Manrope_500Medium', fontWeight: '500' as const }, medium: { fontFamily: 'Manrope_600SemiBold', fontWeight: '600' as const }, bold: { fontFamily: 'Manrope_700Bold', fontWeight: '700' as const }, heavy: { fontFamily: 'Manrope_800ExtraBold', fontWeight: '800' as const } } });

/** Adaptive shell: top bar plus a floating bottom bar on phones, or a side rail and top bar on tablets and TV. Hidden while a round is running. */
export default function AppShell() {
  const { wide } = useDevice();
  const path = usePathname();
  const role = useAuth((s) => s.user?.role);
  const immersive = /^\/nboard\/[^/]+\/(play|ready|result)$/.test(path);
  // Player pages, results, programs and the old dashboards belong to the coaches; the Super Admin has Overview and Coaches instead.
  if (role === 'SUPER_ADMIN') {
    if (/^\/(results|overview|activity)(\/|$)/.test(path) || /^\/programs(\/|$)/.test(path)) return <Redirect href={'/business' as never} />;
    // Only the players LIST is replaced by Coaches (players live inside coach cards). New player, a player's profile and the
    // one-time credentials page must stay reachable, or a new account's password could never be shown.
    if (/^\/players\/?$/.test(path)) return <Redirect href={'/coaches' as never} />;
  }
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <Backdrop />
      {wide && !immersive ? <SideRail /> : null}
      <View style={{ flex: 1 }}>
        {!immersive ? <TopBar /> : null}
        <View style={{ flex: 1 }}>
          <ShellContext.Provider value>
            <ThemeProvider value={navTheme()}><Stack screenOptions={{ headerShown: false, animation: Platform.OS === 'web' ? 'fade' : 'none', freezeOnBlur: true, contentStyle: { backgroundColor: 'transparent' } }} /></ThemeProvider>
          </ShellContext.Provider>
        </View>
        {!wide && !immersive ? <BottomBar /> : null}
      </View>
    </View>
  );
}
