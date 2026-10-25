// The artifact's background: near-black with four very slow violet and blue lights drifting behind the UI, a soft top-right
// violet wash, a blue wash on the left and a dark fade at the bottom. Game events brighten it a little (pulseBg).

import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { create } from 'zustand';
import { C, getThemeMode } from '../theme/tokens';
import { Ambient } from './Gradient';
import { useReducedMotion } from './motion';

const TINT = { tick: ['155,251,0', 0.22], go: ['155,251,0', 0.7], hit: ['155,251,0', 0.4], miss: ['255,82,99', 0.45], clear: ['155,251,0', 0.8], done: ['155,251,0', 0.6] } as const;
export type PulseKind = keyof typeof TINT;

const usePulseStore = create<{ k: PulseKind | null; n: number }>(() => ({ k: null, n: 0 }));
/** Brighten the background for a moment: a hit, a miss, a cleared level. */
export function pulseBg(k: PulseKind) {
  usePulseStore.setState((s) => ({ k, n: s.n + 1 }));
}

// Soft dark gradients band into visible rings and rectangles on many screens (8-bit colour). A faint grain over the top breaks the bands up.
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.4 -0.45'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const BLOBS = [
  { c: '155,251,0', x: 0.3, y: 0.3, sx: 0.5, sy: 0.35, p: 52000 },
  { c: '74,121,0', x: 0.75, y: 0.5, sx: 0.4, sy: 0.4, p: 61000 },
  { c: '155,251,0', x: 0.5, y: 0.8, sx: 0.45, sy: 0.3, p: 47000 },
  { c: '74,121,0', x: 0.2, y: 0.7, sx: 0.35, sy: 0.35, p: 70000 },
];

function Blob({ c, x, y, sx, sy, p, w, h, still }: (typeof BLOBS)[number] & { w: number; h: number; still: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: p, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [still, p, t]);
  const d = Math.max(w, h) * 0.9;
  const steps = 8;
  const range = Array.from({ length: steps + 1 }, (_, i) => i / steps);
  const tx = t.interpolate({ inputRange: range, outputRange: range.map((r) => Math.sin(r * Math.PI * 2) * sx * w * 0.5) });
  const ty = t.interpolate({ inputRange: range, outputRange: range.map((r) => Math.cos(r * Math.PI * 2) * sy * h * 0.5) });
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: w * x - d / 2, top: h * y - d / 2, width: d, height: d, transform: [{ translateX: tx }, { translateY: ty }] }}>
      <Svg width={d} height={d}>
        <Defs>
          <RadialGradient id={`b${c.replace(/,/g, '')}`} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={`rgb(${c})`} stopOpacity={0.1} />
            <Stop offset="1" stopColor={`rgb(${c})`} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={d} height={d} fill={`url(#b${c.replace(/,/g, '')})`} />
      </Svg>
    </Animated.View>
  );
}

export function Backdrop() {
  const { width: w, height: h } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  const kind = usePulseStore((s) => s.k);
  const n = usePulseStore((s) => s.n);
  useEffect(() => {
    if (!kind || reduced || Platform.OS !== 'web') return;
    pulse.setValue(TINT[kind][1]);
    Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [n, kind, reduced, pulse]);
  if (getThemeMode() !== 'dark') return <Ambient a={C.glowA} b={C.glowB} />;
  const tint = kind ? TINT[kind][0] : '155,251,0';
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#010100', overflow: 'hidden' }]}>
      {/* The drifting lights are web-only: four full-screen animated layers cost a phone more than it can spare. */}
      {Platform.OS === 'web' ? BLOBS.map((b) => <Blob key={b.c} {...b} w={w} h={h} still={reduced} />) : null}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.16] }), backgroundColor: `rgb(${tint})` }]} />
      <Svg width="100%" height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="sh1" cx="85%" cy="-6%" rx="75%" ry="38%" fx="85%" fy="-6%">
            <Stop offset="0" stopColor="rgb(155,251,0)" stopOpacity={0.24} />
            <Stop offset="0.72" stopColor="rgb(155,251,0)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="sh2" cx="-8%" cy="58%" rx="60%" ry="34%" fx="-8%" fy="58%">
            <Stop offset="0" stopColor="rgb(74,121,0)" stopOpacity={0.13} />
            <Stop offset="0.7" stopColor="rgb(74,121,0)" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="sh4" cx="4%" cy="14%" rx="30%" ry="42%" fx="4%" fy="14%">
            <Stop offset="0" stopColor="rgb(155,251,0)" stopOpacity={0.16} />
            <Stop offset="1" stopColor="rgb(155,251,0)" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="sh5" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="rgb(120,200,0)" stopOpacity={0.05} />
            <Stop offset="0.07" stopColor="rgb(120,200,0)" stopOpacity={0.04} />
            <Stop offset="0.16" stopColor="rgb(120,200,0)" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="sh3" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.6" stopColor="rgb(1,1,0)" stopOpacity={0} />
            <Stop offset="1" stopColor="rgb(1,1,0)" stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sh1)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sh2)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sh4)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sh5)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sh3)" />
      </Svg>
      {Platform.OS === 'web' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.02, backgroundImage: GRAIN, backgroundRepeat: 'repeat' } as never]} /> : null}
    </View>
  );
}