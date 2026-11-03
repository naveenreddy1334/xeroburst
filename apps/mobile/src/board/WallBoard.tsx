// The 3D wall board for the how-to screen: a tilted metal panel on a steel stand, ten buttons, lit ones glow gold.
// Drawn with SVG only (no filters, no images) so it looks the same on phone, tablet, TV and web.

import { useEffect, useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { F } from '../theme/tokens';
import { useReducedMotion } from '../ui/motion';

const VB_W = 380;
const VB_H = 620;

/** Button centres on the flat face (320 x 340): rows of 3, 2, 3, 2. */
const POS: [number, number][] = [
  [40, 42], [160, 42], [280, 42],
  [100, 127], [220, 127],
  [40, 212], [160, 212], [280, 212],
  [100, 297], [220, 297],
];

interface Props {
  /** buttons that are lit (1 to 10) */
  lit: number[];
  /** the button the finger taps, if any */
  tap?: number;
  width: number;
}

export function WallBoard({ lit, tap, width }: Props) {
  const id = 'wb' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduced = useReducedMotion();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (reduced || tap === undefined) return;
    const t = setInterval(() => setPulse((p) => (p + 1) % 4), 280);
    return () => clearInterval(t);
  }, [reduced, tap]);
  const ringR = 21 + pulse * 3;
  const ringOp = 1 - pulse * 0.24;

  return (
    <View style={{ width, height: (width * VB_H) / VB_W }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Defs>
          <LinearGradient id={`${id}m`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#CFC9B6" />
            <Stop offset="0.5" stopColor="#9A9484" />
            <Stop offset="1" stopColor="#6C675B" />
          </LinearGradient>
          <LinearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.18} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#FFF0C4" />
            <Stop offset="1" stopColor="#E8A83A" />
          </LinearGradient>
          <LinearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#F1C566" />
            <Stop offset="1" stopColor="#6B4C1C" />
          </LinearGradient>
          <LinearGradient id={`${id}l`} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#6E6A5F" />
            <Stop offset="0.45" stopColor="#E3DFD0" />
            <Stop offset="1" stopColor="#7D786B" />
          </LinearGradient>
          <RadialGradient id={`${id}b`} cx="0.5" cy="0.4" rx="0.7" ry="0.7" fx="0.5" fy="0.4">
            <Stop offset="0" stopColor="#FFFBE6" />
            <Stop offset="0.5" stopColor="#FFD978" />
            <Stop offset="1" stopColor="#E09A2A" />
          </RadialGradient>
          <RadialGradient id={`${id}f`} cx="0.5" cy="0.5" rx="0.5" ry="0.5" fx="0.5" fy="0.5">
            <Stop offset="0" stopColor="#E8A83A" stopOpacity={0.4} />
            <Stop offset="1" stopColor="#E8A83A" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}h`} cx="0.5" cy="0.5" rx="0.5" ry="0.5" fx="0.5" fy="0.5">
            <Stop offset="0" stopColor="#FFCD5A" stopOpacity={0.75} />
            <Stop offset="1" stopColor="#FFCD5A" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* floor light and a soft warm glow around the panel */}
        <Ellipse cx="180" cy="592" rx="190" ry="40" fill={`url(#${id}f)`} />
        <Polygon points="47,14 325,82 339,75 339,423 325,434 47,372" fill="#E8A83A" opacity={0.07} />
        <Polygon points="51,18 321,84 335,77 335,421 321,430 51,376" fill="#E8A83A" opacity={0.1} />

        {/* base frame and legs */}
        <Polygon points="60,500 330,560 285,586 15,526" fill="#17120B" fillOpacity={0.6} stroke={`url(#${id}l)`} strokeWidth={6} strokeLinejoin="round" />
        <Polygon points="60,500 330,560 285,586 15,526" fill="none" stroke="#FFFFFF" strokeOpacity={0.25} strokeWidth={1.2} strokeLinejoin="round" />
        <Rect x="49" y="352" width="11" height="154" fill={`url(#${id}l)`} />
        <Rect x="321" y="412" width="11" height="154" fill={`url(#${id}l)`} />

        {/* panel edges */}
        <Polygon points="317,86 331,79 331,419 317,426" fill={`url(#${id}e)`} />
        <Polygon points="55,22 317,86 331,79 69,15" fill={`url(#${id}t)`} stroke="#FFF4CF" strokeWidth={1} />

        {/* panel face, drawn flat then tilted */}
        <G transform="matrix(0.82 0.2 0 1 55 22)">
          <Rect x="0" y="0" width="320" height="340" rx="5" fill={`url(#${id}m)`} />
          <Path d="M0 85 H320 M0 170 H320 M0 255 H320" stroke="#1E1A12" strokeWidth={3} />
          <Path d="M0 88 H320 M0 173 H320 M0 258 H320" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.5} />
          <Rect x="0" y="0" width="320" height="340" rx="5" fill={`url(#${id}s)`} />
          <Rect x="0" y="0" width="320" height="340" rx="5" fill="none" stroke="#F3D27F" strokeOpacity={0.55} strokeWidth={2} />
          {POS.map(([cx, cy], i) => {
            const n = i + 1;
            const on = lit.includes(n);
            return (
              <G key={n}>
                {on ? <Circle cx={cx} cy={cy} r={34} fill={`url(#${id}h)`} /> : null}
                <Circle cx={cx} cy={cy} r={17} fill={on ? `url(#${id}b)` : '#17120A'} stroke={on ? '#FFF1C2' : '#2F281B'} strokeWidth={on ? 2 : 2.5} />
                <SvgText x={cx} y={cy + 4.5} textAnchor="middle" fontSize={on ? 13 : 12} fontFamily={F.monoBold} fill={on ? '#3A2406' : '#8B7B58'}>{String(n)}</SvgText>
                {tap === n ? <Circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#FFFFFF" strokeWidth={2.5} opacity={ringOp} /> : null}
              </G>
            );
          })}
        </G>

        {/* cable */}
        <Rect x="331" y="272" width="14" height="16" rx="3" fill="#1A1510" stroke="#6B6558" strokeWidth={1.5} />
        <Path d="M345 280 C366 280 372 312 364 356" fill="none" stroke="#C4561B" strokeWidth={6} strokeLinecap="round" />
        <Path d="M345 279 C365 279 370 310 363 354" fill="none" stroke="#FF9A4D" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </View>
  );
}
