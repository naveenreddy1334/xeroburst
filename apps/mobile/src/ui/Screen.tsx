import { createContext, useContext } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme/tokens';
import { Backdrop } from './Backdrop';
import { useDevice } from '../theme/device';

/** True inside the app shell: the top bar already handles the top safe area and a floating bar may sit at the bottom. */
export const ShellContext = createContext(false);

interface Props {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** wider content (tables, two-pane layouts) */
  maxWidth?: number;
  /** keep the bottom padding small when a footer bar sits below */
  footer?: ReactNode;
  noTopInset?: boolean;
  center?: boolean;
  /** the content fills the height and scrolls in its own panes (two-pane TV screens) */
  fill?: boolean;
  testID?: string;
}

/** Page container: background, safe areas, gutters that grow on tablet and TV, centred max width. */
export function Screen({ children, scroll = true, refreshing, onRefresh, maxWidth = 1500, footer, noTopInset, center, fill, testID }: Props) {
  const insets = useSafeAreaInsets();
  const { gutter, tv, wide, u } = useDevice();
  const inShell = useContext(ShellContext);
  const pad = { paddingHorizontal: gutter, paddingTop: inShell ? (wide ? u * 0.25 : u * 0.75) : (noTopInset ? 0 : insets.top) + (tv ? 28 : 12) };
  const bottom = inShell && !wide ? u * 7 : u * 1.5;
  const inner = (
    <View style={[styles.inner, { maxWidth }, center && { justifyContent: 'center', flexGrow: 1 }, fill && { flex: 1, minHeight: 0 }]}>{children}</View>
  );
  return (
    <View style={[styles.root, { backgroundColor: inShell ? 'transparent' : C.bg }]} testID={testID}>
      {inShell ? null : <Backdrop />}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[pad, { paddingBottom: bottom, alignItems: 'center', flexGrow: 1 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.primary} colors={[C.primary]} progressBackgroundColor={C.bg2} /> : undefined}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.flex, pad, { alignItems: 'center', paddingBottom: fill ? u * 1.25 : bottom }]}>{inner}</View>
      )}
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  inner: { width: '100%', gap: 12 },
});
