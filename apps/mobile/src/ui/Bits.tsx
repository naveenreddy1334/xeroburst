// Small pieces the design repeats on many screens: sized text, status pill, facts grid, quiet note, round chips and the sliding tab bar.

import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, View } from 'react-native';
import type { LayoutRectangle, StyleProp, TextStyle, ViewStyle } from 'react-native';
import { C, F } from '../theme/tokens';
import { glassLo, glassSurface, glowBox, neoSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { GradientFill } from './Gradient';
import { Txt } from './Txt';
import { useFocus } from './useFocus';

const FONT = { m: F.body, s: F.mono, b: F.bodySemi, x: F.display } as const;

/** Text sized in design units (1 = u): <X s={.85} w="b" up>. Weights: m 500, s 600, b 700, x 800. */
export function X({ s = 1, w = 'm', c, up, num, style, children, ...rest }: { s?: number; w?: keyof typeof FONT; c?: string; up?: boolean; num?: boolean; style?: StyleProp<TextStyle>; children?: React.ReactNode; numberOfLines?: number; testID?: string }) {
  const { u } = useDevice();
  return (
    <Txt {...rest} size={s * 15} style={[{ fontFamily: FONT[w], lineHeight: Math.round(u * s * 1.4 * 10) / 10, color: c ?? C.text }, up ? { textTransform: 'uppercase', letterSpacing: 0.35 } : null, num ? { fontVariant: ['tabular-nums'] } : null, style]}>
      {children}
    </Txt>
  );
}

export function Pill({ t = '', children }: { t?: 'good' | 'off' | 'warn' | ''; children: React.ReactNode }) {
  const { u } = useDevice();
  const bg = t === 'good' ? 'rgba(155,251,0,.12)' : t === 'off' ? C.tint : t === 'warn' ? 'rgba(255,189,89,.12)' : C.tint;
  const fg = t === 'good' ? C.success : t === 'off' ? C.faint : t === 'warn' ? C.warning : C.text;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: u * 0.75, paddingVertical: u * 0.25, borderRadius: 999, backgroundColor: bg }}>
      <X s={0.78} w="s" c={fg} numberOfLines={1}>{children}</X>
    </View>
  );
}

export function Facts({ items }: { items: [string, string | number][] }) {
  const { u } = useDevice();
  const [w, setW] = useState(0);
  const gap = u * 0.625;
  const cols = Math.max(1, Math.floor((w + gap) / (u * 7 + gap)));
  const cw = w ? (w - gap * (cols - 1)) / cols : u * 7;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {items.map(([l, v]) => (
        <View key={l} style={[{ width: cw, minWidth: 0, borderRadius: u, paddingHorizontal: u * 0.75, paddingVertical: u * 0.625, overflow: 'hidden' }, glassLo()]}>
          <X s={0.78} w="b" c={C.faint}>{l}</X>
          <X s={1.05} w="x" num>{String(v)}</X>
        </View>
      ))}
    </View>
  );
}

/** A quiet inner note (.glass-lo rounded-lg p-5, centred). */
export function Empty({ children }: { children: React.ReactNode }) {
  const { u } = useDevice();
  return (
    <View style={[{ borderRadius: u * 1.25, padding: u * 1.25, alignItems: 'center' }, glassLo()]}>
      <X s={0.9} c={C.sub} style={{ textAlign: 'center' }}>{children}</X>
    </View>
  );
}

/** The round chips: gradient when selected, raised neo otherwise. */
export function RoundChip({ label, on, onPress, icon, lead }: { label: string; on: boolean; onPress: () => void; icon?: React.ReactNode; lead?: React.ReactNode }) {
  const { u } = useDevice();
  const { focused, handlers } = useFocus();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      {...handlers}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: u * 0.5, borderRadius: 999, overflow: 'hidden', paddingHorizontal: lead ? u * 0.875 : u * 0.875, paddingLeft: lead ? u * 0.375 : u * 0.875, paddingVertical: lead ? u * 0.375 : u * 0.5, borderWidth: focused ? u * 0.18 : 0, borderColor: '#fff' },
        on ? glowBox(u, 'pill') : neoSurface(u),
      ]}
    >
      {on ? <GradientFill /> : null}
      {lead}
      {icon}
      <X s={0.85} w="b" c={on ? '#000' : C.idle} style={{ whiteSpace: 'nowrap' } as TextStyle}>{label}</X>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  const { u, wide } = useDevice();
  // On wide screens the chips simply wrap: a scrolling box would clip the glow and shadows of the chips into a visible rectangle.
  if (wide) return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5, padding: u * 0.375 }}>{children}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: u * 0.5, paddingHorizontal: u * 1.375, paddingVertical: u * 1.1 }} style={{ flexGrow: 0, marginHorizontal: -u, marginVertical: -u * 0.725, overflow: 'visible' }}>
      {children}
    </ScrollView>
  );
}

let lastTab = new Map<string, string>();

/** The glass tab bar with a gradient pill that slides to the chosen tab (the design's layoutId pill). */
export function SlideTabs({ id, tabs, value, onChange }: { id: string; tabs: string[]; value: string; onChange: (t: string) => void }) {
  const { u } = useDevice();
  const [rects, setRects] = useState<Record<string, LayoutRectangle>>({});
  const x = useRef(new Animated.Value(0)).current;
  const w = useRef(new Animated.Value(0)).current;
  const o = useRef(new Animated.Value(0)).current;
  const first = useRef(true);
  const r = rects[value];
  useEffect(() => {
    if (!r) return;
    const from = first.current ? rects[lastTab.get(id) ?? value] ?? r : null;
    if (first.current) {
      first.current = false;
      x.setValue(from!.x);
      w.setValue(from!.width);
      o.setValue(1);
    }
    const cfg = { useNativeDriver: false, stiffness: 420, damping: 34, mass: 1 } as const;
    Animated.parallel([Animated.spring(x, { toValue: r.x, ...cfg }), Animated.spring(w, { toValue: r.width, ...cfg })]).start();
    lastTab.set(id, value);
  }, [r?.x, r?.width, value]); // eslint-disable-line react-hooks/exhaustive-deps
  // Every tab must be visible. If they fit on one line (the labels shrink a little when needed) they stay on one line with the
  // sliding pill. If that would make the text too small (a phone with six tabs), they wrap into rows of three instead.
  const [avail, setAvail] = useState(0);
  const chars = tabs.reduce((n, t) => n + t.length, 0);
  const need = chars * 0.5 * 0.72 * u + tabs.length * 1.75 * u + (tabs.length - 1) * 0.25 * u + 0.5 * u;
  const fit = avail > 0 ? avail / need : 1;
  const wrap = fit < 0.8;
  const k = wrap ? 1 : Math.max(0.8, Math.min(1, fit));
  return (
    <View onLayout={(e) => setAvail(Math.round(e.nativeEvent.layout.width))} style={{ width: '100%', alignItems: 'flex-start' }}>
      <View style={[{ flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap', maxWidth: '100%', width: wrap ? '100%' : undefined, padding: u * 0.25, gap: u * 0.25, borderRadius: u * 1.25 } as ViewStyle, glassSurface(u)]}>
        {wrap ? null : (
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: u * 0.25, bottom: u * 0.25, left: x, width: w, opacity: o, borderRadius: u, overflow: 'hidden' }, glowBox(u, 'pill')]}>
            <GradientFill />
          </Animated.View>
        )}
        {tabs.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="tab"
            accessibilityState={{ selected: value === t }}
            onLayout={(e) => { const l = e.nativeEvent.layout; setRects((p) => (p[t]?.x === l.x && p[t]?.width === l.width ? p : { ...p, [t]: l })); }}
            onPress={() => onChange(t)}
            style={[{ paddingHorizontal: u * 0.875 * k, paddingVertical: u * 0.5, borderRadius: u, overflow: 'hidden' }, wrap ? { flexBasis: '30%', flexGrow: 1, alignItems: 'center' } : null]}
          >
            {wrap && value === t ? <GradientFill /> : null}
            <X s={0.72 * k} w="m" c={value === t ? '#000' : C.idle} numberOfLines={1}>{t}</X>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Card heading (text-sm semibold) with a quiet note at the right. */
export function CardH({ children, em }: { children: React.ReactNode; em?: string }) {
  const { u } = useDevice();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.75 }}>
      <X s={0.85 * 1.0} w="s" style={{ flexShrink: 1 }}>{children}</X>
      {em ? <X s={0.85 * 0.85} c={C.faint}>{em}</X> : null}
    </View>
  );
}

/** The segmented control (7 days / 14 days): glass track, a lit pill on the chosen item. */
export function Seg<T extends string | number>({ items, value, onChange }: { items: [T, string][]; value: T; onChange: (v: T) => void }) {
  const { u } = useDevice();
  return (
    <View style={[{ flexDirection: 'row', borderRadius: u, padding: u * 0.25, alignSelf: 'flex-start' }, glassLo()]}>
      {items.map(([k, l]) => {
        const on = value === k;
        return (
          <Pressable key={String(k)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => onChange(k)} style={[{ minHeight: u * 2.25, minWidth: u * 3, paddingHorizontal: u, borderRadius: u * 0.5, alignItems: 'center', justifyContent: 'center' }, on ? ({ backgroundColor: C.tintHi, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), inset 0 0 0 1px rgba(155,251,0,.25)' } as never) : null]}>
            <X s={0.85} w="b" c={on ? '#F3FAE6' : C.sub} style={{ whiteSpace: 'nowrap' } as TextStyle}>{l}</X>
          </Pressable>
        );
      })}
    </View>
  );
}