// The plain ring gauge used on Results: a gradient ring that draws in, the number in the middle with its unit under it, a label below.

import { useId, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useDevice } from '../theme/device';
import { useReveal } from './motion';
import { X } from './Bits';
import { C } from '../theme/tokens';

const RG: [string, string][] = [['#9BFB00', '#4A7900'], ['#D2FF7A', '#4A7900'], ['#D2FF7A', '#4A7900'], ['#D2FF7A', '#9BFB00'], ['#FFBD59', '#9BFB00']];

export function RingGauge({ frac, ci = 0, v, dec = 0, unit, label, k }: { frac: number; ci?: number; v: number; dec?: number; unit?: string; label: string; k: string }) {
  const { u, tv } = useDevice();
  const id = 'rg' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  const t = useReveal(1600, k, [0.2, 0.9, 0.2, 1]);
  const compact = w > 0 && w < u * 7;
  const size = Math.min(w, u * (tv ? 10 : 8.4));
  const sw = compact ? 12 : 9;
  const r = 50 - sw / 2 - 1;
  const circ = 2 * Math.PI * r;
  const f = Math.max(0.02, Math.min(1, frac)) * t;
  const g = RG[ci % 5]!;
  return (
    <View style={{ minWidth: 0, alignItems: 'center', gap: u * 0.5 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          {size > 0 ? (
            <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute', overflow: 'visible' }}>
              <Defs>
                <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={g[0]} />
                  <Stop offset="1" stopColor={g[1]} />
                </LinearGradient>
              </Defs>
              <Circle cx={50} cy={50} r={r} fill="none" stroke={C.grid} strokeWidth={sw} />
              <Circle cx={50} cy={50} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${f * circ} ${circ}`} transform="rotate(-90 50 50)" />
            </Svg>
          ) : null}
          <View style={{ alignItems: 'center' }}>
            <X s={compact ? 0.85 : tv ? 1.4 : 1.15} w="s" num style={{ lineHeight: u * (tv ? 1.5 : 1.25) }}>{(v * t > 0 && dec === 0 ? Math.round(v * t) : v * t).toFixed(dec)}</X>
            <X s={(compact ? 0.85 : tv ? 1.4 : 1.15) * 0.55} c={C.faint} style={{ paddingTop: u * 0.2 }}>{unit || ' '}</X>
          </View>
        </View>
      </View>
      <X s={compact ? 0.62 : 0.82} c={C.sub} numberOfLines={1}>{label}</X>
    </View>
  );
}
