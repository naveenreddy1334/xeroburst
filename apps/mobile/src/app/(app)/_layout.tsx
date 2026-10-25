import { View } from 'react-native';
import { Stack, ThemeProvider, usePathname } from 'expo-router';
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
  const immersive = /^\/nboard\/[^/]+\/(play|ready|result)$/.test(path);
  return (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: C.bg }}>
      <Backdrop />
      {wide && !immersive ? <SideRail /> : null}
      <View style={{ flex: 1 }}>
        {!immersive ? <TopBar /> : null}
        <View style={{ flex: 1 }}>
          <ShellContext.Provider value>
            <ThemeProvider value={navTheme()}><Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: 'transparent' } }} /></ThemeProvider>
          </ShellContext.Provider>
        </View>
        {!wide && !immersive ? <BottomBar /> : null}
      </View>
    </View>
  );
}