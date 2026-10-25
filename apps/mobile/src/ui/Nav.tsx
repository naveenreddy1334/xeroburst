// Navigation chrome in the XeroBurst glass look.
//   Phone:         floating glass bar at the bottom (4 items + More), with a sliding purple pill.
//   Tablet and TV: a slim icon rail on the left with the same sliding pill, Settings pinned to the bottom.
//   Top bar:       wordmark, search, date range, pulse, bell, profile (phone: wordmark, bell, avatar). The logo is on the login page only.
// Both bars are built from the menu the shared package derives from permissions.

import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import type { LayoutRectangle } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuFor } from '@nboard/shared';
import type { MenuId } from '@nboard/shared';
import { useAuth } from '../state/auth';
import { useRange, useSearch } from '../state/shell';
import { MENU } from '../lib/nav';
import { C, R, alpha } from '../theme/tokens';
import { glassSurface, glowBox, neoSurface, neoIn } from '../theme/surfaces';
import { GradientFill } from './Gradient';
import { Icon } from './Icon';
import { Wordmark } from './Logo';
import { Avatar } from './Avatar';
import { Txt } from './Txt';
import { Dialog } from './Dialog';
import { useFocus } from './useFocus';
import { useDevice } from '../theme/device';

/** Audit log and System live as tabs under Settings, so they have no entry of their own. */
const NESTED: MenuId[] = ['audit', 'system'];

export function useMenu(): MenuId[] {
  const role = useAuth((s) => s.user?.role);
  const permissions = useAuth((s) => s.permissions);
  return role ? menuFor({ role, permissions }) : [];
}

function activeId(path: string, menu: MenuId[]): MenuId | null {
  const first = '/' + (path.split('/')[1] ?? '');
  if (path === '/' || path === '') return 'dashboard';
  if (first === '/nboard') return 'modules';
  if (first === '/audit' || first === '/system') return 'settings';
  if ((first === '/overview' || first === '/activity') && menu.includes('results')) return 'results';
  const hit = menu.find((m) => m !== 'dashboard' && MENU[m].href === first);
  return hit ?? null;
}

// ---- the sliding pill -------------------------------------------------------------------------------------------

type Rects = Record<string, LayoutRectangle>;

function useRects() {
  const [rects, setRects] = useState<Rects>({});
  const put = (key: string) => (e: { nativeEvent: { layout: LayoutRectangle } }) => {
    const l = e.nativeEvent.layout;
    setRects((r) => (r[key] && r[key]!.x === l.x && r[key]!.y === l.y && r[key]!.width === l.width && r[key]!.height === l.height ? r : { ...r, [key]: l }));
  };
  return { rects, put };
}

/** A gradient pill that glides from the old item to the new one. It never jumps through other items. */
function Pill({ rects, active, radius, kind }: { rects: Rects; active: string | null; radius: number; kind: 'pill' | 'bar' }) {
  const { u } = useDevice();
  const a = useRef({ x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0), h: new Animated.Value(0), o: new Animated.Value(0) }).current;
  const placed = useRef(false);
  const r = active ? rects[active] : undefined;
  useEffect(() => {
    if (!r) {
      Animated.timing(a.o, { toValue: 0, duration: 180, useNativeDriver: false }).start();
      return;
    }
    if (!placed.current) {
      placed.current = true;
      a.x.setValue(r.x);
      a.y.setValue(r.y);
      a.w.setValue(r.width);
      a.h.setValue(r.height);
      a.o.setValue(1);
      return;
    }
    const cfg = { useNativeDriver: false, stiffness: 320, damping: 30, mass: 0.9 } as const;
    Animated.parallel([
      Animated.spring(a.x, { toValue: r.x, ...cfg }),
      Animated.spring(a.y, { toValue: r.y, ...cfg }),
      Animated.spring(a.w, { toValue: r.width, ...cfg }),
      Animated.spring(a.h, { toValue: r.height, ...cfg }),
      Animated.timing(a.o, { toValue: 1, duration: 160, useNativeDriver: false }),
    ]).start();
  }, [r?.x, r?.y, r?.width, r?.height, active]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', left: a.x, top: a.y, width: a.w, height: a.h, opacity: a.o, borderRadius: radius, overflow: 'hidden' },
        glowBox(u, kind),
      ]}
    >
      <GradientFill />
    </Animated.View>
  );
}

// ---- items ------------------------------------------------------------------------------------------------------

function NavItem({ id, label, icon, active, onPress, onLayout, bar, preferred, push }: { push?: boolean; id: string; label: string; icon: (typeof MENU)[MenuId]['icon']; active: boolean; onPress: () => void; onLayout: (e: { nativeEvent: { layout: LayoutRectangle } }) => void; bar?: boolean; preferred?: boolean }) {
  const { focused, handlers } = useFocus();
  const { u } = useDevice();
  const scale = useRef(new Animated.Value(1)).current;
  const lift = useRef(new Animated.Value(active ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(lift, { toValue: active ? 1 : 0, useNativeDriver: Platform.OS !== 'web', stiffness: 380, damping: 22 }).start();
  }, [active, lift]);
  const press = (to: number) => Animated.spring(scale, { toValue: to, useNativeDriver: Platform.OS !== 'web', stiffness: 500, damping: 26 }).start();
  const fg = active ? '#000000' : bar ? C.navIdle : C.idle;
  return (
    <Pressable
      testID={`nav-${id}`}
      onPress={onPress}
      onPressIn={() => press(0.92)}
      onPressOut={() => press(1)}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hasTVPreferredFocus={preferred}
      {...handlers}
      style={
        bar
          ? { flex: 1, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' }
          : { width: '100%', paddingHorizontal: u * 0.25, paddingVertical: u * 0.4, borderRadius: u * 1.6, alignItems: 'center', justifyContent: 'center', marginTop: push ? 'auto' : 0, borderWidth: focused ? u * 0.16 : 0, borderColor: '#FFFFFF', backgroundColor: focused ? C.tintHi : 'transparent' }
      }
    >
      <Animated.View style={{ alignItems: 'center', gap: bar ? u * 0.125 : 0, transform: [{ scale }, { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, bar ? -1 : 0] }) }] }}>
        <Icon name={icon} size={bar ? u * 1.5 : u * 1.15} color={fg} />
        <Txt v="small" size={bar ? 11.7 : 10.2} color={fg} numberOfLines={1} style={{ letterSpacing: 0, lineHeight: bar ? u * 1.1 : u * 0.9, fontFamily: bar ? 'Manrope_700Bold' : 'Manrope_500Medium' }}>
          {label}
        </Txt>
      </Animated.View>
    </Pressable>
  );
}

// ---- side rail (tablet, TV, wide web) ---------------------------------------------------------------------------

export function SideRail() {
  const menu = useMenu();
  const path = usePathname();
  const router = useRouter();
  const { tv, u } = useDevice();
  const insets = useSafeAreaInsets();
  const active = activeId(path, menu);
  const { rects, put } = useRects();
  const items = menu.filter((m) => !NESTED.includes(m));
  const top = items.filter((m) => m !== 'settings');
  const hasSettings = items.includes('settings');
  const item = (id: MenuId, push?: boolean) => (
    <NavItem push={push} key={id} id={id} label={MENU[id].label} icon={MENU[id].icon} active={active === id} preferred={tv && id === active} onLayout={put(id)} onPress={() => router.navigate(MENU[id].href as never)} />
  );
  // No logo up here any more: the icons start lower, level with the page title, and nothing clips the glow of the pill.
  return (
    <View style={{ width: u * 5.6, paddingTop: insets.top + u * 3.4, paddingBottom: insets.bottom + u * 0.75, paddingHorizontal: u * 0.5, overflow: 'visible' }}>
      <View style={{ flex: 1, width: '100%', gap: u * 1.0, overflow: 'visible' }}>
        <Pill rects={rects} active={active} radius={u * 1.6} kind="pill" />
        <View style={{ flex: 1 }} />
        {top.map((id) => item(id))}
        <View style={{ flex: 1 }} />
        {hasSettings ? item('settings', true) : null}
      </View>
    </View>
  );
}

// ---- phone bottom bar -------------------------------------------------------------------------------------------

const BAR_PRIORITY: MenuId[] = ['dashboard', 'modules', 'players', 'results', 'settings'];

export function BottomBar() {
  const menu = useMenu();
  const path = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { u } = useDevice();
  const [more, setMore] = useState(false);
  const active = activeId(path, menu);
  const items = menu.filter((m) => !NESTED.includes(m));
  const inBar = items.length <= 4 ? items : BAR_PRIORITY.filter((m) => items.includes(m)).slice(0, 4);
  const rest = items.filter((m) => !inBar.includes(m));
  const moreActive = !!active && rest.includes(active);
  const { rects, put } = useRects();
  return (
    <>
      <View pointerEvents="box-none" style={{ position: 'absolute', left: u * 0.875, right: u * 0.875, bottom: Math.max(insets.bottom, 0) + u * 0.875 }}>
        <View style={[{ height: u * 4.4, borderRadius: R.pill, padding: u * 0.375 }, glassSurface(u, true)]}>
          <View style={{ flex: 1, flexDirection: 'row' }}>
            <Pill rects={rects} active={moreActive ? 'more' : active} radius={R.pill} kind="bar" />
            {inBar.map((id) => (
              <NavItem key={id} bar id={id} label={MENU[id].label} icon={MENU[id].icon} active={active === id} onLayout={put(id)} onPress={() => router.navigate(MENU[id].href as never)} />
            ))}
            {rest.length ? <NavItem key="more" bar id="more" label="More" icon="more" active={moreActive} onLayout={put('more')} onPress={() => setMore(true)} /> : null}
          </View>
        </View>
      </View>
      <Modal visible={more} transparent animationType="slide" onRequestClose={() => setMore(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }} onPress={() => setMore(false)}>
          <View style={[{ borderTopLeftRadius: u * 1.6, borderTopRightRadius: u * 1.6, padding: u * 1.25, paddingBottom: insets.bottom + u * 1.5, gap: u * 0.4 }, glassSurface(u, true)]}>
            {rest.map((id) => (
              <SheetRow key={id} icon={MENU[id].icon} label={MENU[id].label} active={active === id} onPress={() => { setMore(false); router.navigate(MENU[id].href as never); }} />
            ))}
            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 4 }} />
            <SignOutRow onDone={() => setMore(false)} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function SheetRow({ icon, label, active, onPress, danger }: { icon: (typeof MENU)[MenuId]['icon'] | 'logout'; label: string; active?: boolean; onPress: () => void; danger?: boolean }) {
  const { focused, handlers } = useFocus();
  const { u } = useDevice();
  const fg = danger ? '#FF5263' : active ? '#000000' : C.text;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...handlers}
      style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.9, minHeight: u * 3.2, paddingHorizontal: u, borderRadius: u, overflow: 'hidden', borderWidth: focused ? u * 0.18 : 0, borderColor: '#FFFFFF' }}
    >
      {active ? <GradientFill /> : null}
      <Icon name={icon} size={u * 1.35} color={active ? '#000000' : danger ? '#FF5263' : C.sub} />
      <Txt v="bodyStrong" color={fg}>{label}</Txt>
    </Pressable>
  );
}

function SignOutRow({ onDone }: { onDone?: () => void }) {
  const [ask, setAsk] = useState(false);
  return (
    <>
      <SheetRow icon="logout" label="Sign out" danger onPress={() => setAsk(true)} />
      <Dialog
        visible={ask}
        title="Sign out?"
        message="You will need your ID and PIN or password to sign in again."
        confirmLabel="Sign out"
        danger
        onConfirm={() => {
          setAsk(false);
          onDone?.();
          void useAuth.getState().logout();
        }}
        onCancel={() => setAsk(false)}
      />
    </>
  );
}

// ---- top bar ----------------------------------------------------------------------------------------------------

function RoundBtn({ icon, label, onPress, dot, testID, tint }: { icon: (typeof MENU)[MenuId]['icon'] | 'search'; label: string; onPress: () => void; dot?: boolean; testID?: string; tint?: string }) {
  const { focused, handlers } = useFocus();
  const { u, wide } = useDevice();
  const s = wide ? u * 2.5 : u * 2.5;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} {...handlers} style={[{ width: s, height: s, borderRadius: u * 1.25, alignItems: 'center', justifyContent: 'center', borderWidth: focused ? u * 0.18 : 0, borderColor: '#FFFFFF' }, neoSurface(u)]}>
      <Icon name={icon as never} size={u * 1.25} color={tint ?? C.idle} />
      {dot ? <View style={{ position: 'absolute', top: u * 0.5, right: u * 0.5, width: u * 0.5, height: u * 0.5, borderRadius: u * 0.25, backgroundColor: '#FF5263' }} /> : null}
    </Pressable>
  );
}

function RangeMenu() {
  const days = useRange((s) => s.days);
  const set = useRange((s) => s.set);
  const [open, setOpen] = useState(false);
  const { focused, handlers } = useFocus();
  const { u } = useDevice();
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Date range: last ${days} days`} testID="range-menu" {...handlers} style={[{ height: u * 2.5, paddingLeft: u, paddingRight: u * 0.9, borderRadius: u * 1.25, flexDirection: 'row', alignItems: 'center', gap: u * 1.1, borderWidth: focused ? u * 0.18 : 0, borderColor: '#FFFFFF' }, neoSurface(u)]}>
        <Txt v="bodyStrong" size={12.8} style={{ fontFamily: 'Manrope_500Medium' }}>Last {days} Days</Txt>
        <Icon name="chevronDown" size={u * 0.9} color="#9aa3b8" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: u * 1.5 }} onPress={() => setOpen(false)}>
          <View style={[{ width: u * 16, borderRadius: u * 1.6, padding: u * 0.6, gap: u * 0.25 }, glassSurface(u, true)]}>
            {([7, 14, 30] as const).map((d) => (
              <SheetRow key={d} icon="clock" label={`Last ${d} days`} active={d === days} onPress={() => { set(d); setOpen(false); }} />
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

function ProfileMenu() {
  const user = useAuth((s) => s.user)!;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { wide, u } = useDevice();
  const { focused, handlers } = useFocus();
  const roleLabel = user.role.replace('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
  return (
    <>
      <Pressable testID="profile-menu" onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Profile menu" {...handlers} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625, borderRadius: u * 1.25, borderWidth: focused ? u * 0.18 : 0, borderColor: '#FFFFFF' }}>
        <Avatar name={user.display_name} size={u * 2.75} />
        {wide ? (
          <>
            <View>
              <Txt v="bodyStrong" size={12.8} numberOfLines={1}>{user.display_name}</Txt>
              <Txt v="small" size={10.8} numberOfLines={1}>{roleLabel}</Txt>
            </View>
            <Icon name="chevronDown" size={u} color={C.sub} />
          </>
        ) : null}
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: u * 1.5 }} onPress={() => setOpen(false)}>
          <View style={[{ width: u * 18, borderRadius: u * 1.6, padding: u * 0.75, gap: u * 0.25 }, glassSurface(u, true)]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, padding: u * 0.6 }}>
              <Avatar name={user.display_name} size={u * 2.9} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong" numberOfLines={1}>{user.display_name}</Txt>
                <Txt v="small" numberOfLines={1}>{roleLabel}</Txt>
              </View>
            </View>
            <SheetRow icon="settings" label="Settings" onPress={() => { setOpen(false); router.navigate('/settings' as never); }} />
            <SignOutRow onDone={() => setOpen(false)} />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export function TopBar() {
  const { tv, wide, u } = useDevice();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const menu = useMenu();
  const q = useSearch((s) => s.q);
  const setQ = useSearch((s) => s.set);
  const canSearch = menu.includes('players');
  const staff = menu.includes('results');
  const [focus, setFocus] = useState(false);
  const field = [{ marginLeft: u * 0.75, height: u * 2.5, width: u * 17, borderRadius: u * 1.25, flexDirection: 'row' as const, alignItems: 'center' as const, gap: u * 0.5, paddingHorizontal: u * 0.75 }, glassSurface(u), neoIn(u)];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, paddingTop: insets.top + (wide ? u * 0.875 : u * 0.75), paddingLeft: wide ? u * 1.6 : u, paddingRight: wide ? u * 1.25 : u, paddingBottom: u * 0.25, zIndex: 5 }}>
      <Wordmark height={wide ? u * 1.55 : u * 1.2} />
      {wide && canSearch ? (
        tv ? (
          <Pressable onPress={() => router.navigate('/players' as never)} accessibilityRole="button" accessibilityLabel="Search players" style={field}>
            <Icon name="search" size={u} color={C.sub} />
            <Txt v="small" size={12.8} color={C.faint}>Search players, tests...</Txt>
          </Pressable>
        ) : (
          <View style={[...field, focus ? { borderWidth: 1.5, borderColor: alpha(C.highlight, 0.7) } : null]}>
            <Icon name="search" size={u} color={C.sub} />
            <TextInput
              value={q}
              onChangeText={(t) => { setQ(t); if (t) router.navigate('/players' as never); }}
              onFocus={() => setFocus(true)}
              onBlur={() => setFocus(false)}
              placeholder="Search players, tests..."
              placeholderTextColor={C.faint}
              accessibilityLabel="Search players"
              style={[{ flex: 1, color: C.text, fontFamily: 'Manrope_500Medium', fontSize: u * 0.85, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
          </View>
        )
      ) : null}
      <View style={{ flex: 1 }} />
      {wide && staff ? <RangeMenu /> : null}
      <RoundBtn icon="bell" label="Activity" dot={staff} onPress={() => router.navigate((staff ? '/activity' : '/results') as never)} testID="top-bell" />
      <ProfileMenu />
    </View>
  );
}