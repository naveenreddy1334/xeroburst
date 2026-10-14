// A gauge tile from the Analytics design: a gradient ring that draws in, an icon, the number counting up, a change vs the
// previous round, then the label and a one-line explanation. The ring is a 100-unit circle, r 43, stroke 7.

import { useId, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import type { IconName } from '@nboard/shared';
import { C } from '../theme/tokens';
import { glassSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { useReveal } from './motion';
import { Icon } from './Icon';
import { Txt } from './Txt';

const PAIRS: [string, string][] = [['#B84AFF', '#315BFF'], ['#35C7FF', '#315BFF'], ['#35C7FF', '#672BFF'], ['#B84AFF', '#672BFF'], ['#35C7FF', '#9400D3']];

export interface GaugeProps {
  icon: IconName;
  val: number;
  dec?: number;
  unit?: string;
  /** percent change vs the previous round */
  delta?: number | null;
  good?: boolean;
  label: string;
  sub: string;
  /** 0..1 how full the ring is */
  frac: number;
  /** colour pair 0..4 */
  ci: number;
  /** changes when the selection changes, so the ring and number draw in again */
  k: string;
}

export function Gauge({ icon, val, dec = 0, unit, delta, good, label, sub, frac, ci, k }: GaugeProps) {
  const { u, tv } = useDevice();
  const id = 'g' + useId().replace(/[^a-zA-Z0-9]/g, '');
  const [w, setW] = useState(0);
  const t = useReveal(1600, k, [0.2, 0.9, 0.2, 1]);
  const tn = useReveal(1400, k, [0.2, 0.9, 0.2, 1]);
  const g = PAIRS[ci]!;
  // Five rings sit in one row; on a phone each one is small, so the ring is drawn thicker and the extras (icon, caption) drop out.
  const compact = w > 0 && w < u * 7;
  const size = Math.min(Math.max(0, w - (compact ? u * 0.5 : u)), u * 8.4);
  const sw = compact ? 13 : 10;
  const r = 50 - sw / 2 - 1;
  const circ = 2 * Math.PI * r;
  const pl = Math.max(0.03, Math.min(1, frac)) * t;
  const fs = (compact ? 0.78 : tv ? 1.25 : 1.1) * u;
  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
      accessibilityLabel={`${label} ${val.toFixed(dec)}${unit ? ' ' + unit : ''}`}
      style={[{ minWidth: 0, alignItems: 'center', borderRadius: u * 1.6, paddingHorizontal: u * 0.25, paddingTop: u * 0.75, paddingBottom: u * 0.75 }, glassSurface(u)]}
    >
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
            <Circle cx={50} cy={50} r={r} fill="none" stroke={`url(#${id})`} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${pl * circ} ${circ}`} transform="rotate(-90 50 50)" />
          </Svg>
        ) : null}
        <View style={{ alignItems: 'center', gap: fs * 0.15 }}>
          {compact ? null : <Icon name={icon} size={u * 1.1} color={g[0]} strokeWidth={1.7} />}
          <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <Txt v="bodyStrong" size={(fs / u) * 15} style={{ lineHeight: fs, fontFamily: 'Manrope_700Bold', fontVariant: ['tabular-nums'] }}>{(val * tn).toFixed(dec)}</Txt>
            {unit ? <Txt v="bodyStrong" size={(fs / u) * 15 * 0.5} color={C.idle} style={{ marginLeft: u * 0.125 }}>{unit}</Txt> : null}
          </View>
          {delta != null && !compact ? (
            <Txt v="bodyStrong" size={0.62 * 15} color={good ? C.success : C.danger} style={{ fontVariant: ['tabular-nums'] }}>{delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(0)}%</Txt>
          ) : null}
        </View>
      </View>
      <Txt v="bodyStrong" size={(compact ? 0.56 : 0.72) * 15} numberOfLines={1} style={{ marginTop: u * 0.5, textAlign: 'center', textTransform: 'uppercase', letterSpacing: compact ? 0 : u * 0.025 }}>{compact ? label.split(' ')[0] : label}</Txt>
      {compact ? (delta != null ? <Txt v="bodyStrong" size={0.58 * 15} color={good ? C.success : C.danger} style={{ fontVariant: ['tabular-nums'] }}>{delta > 0 ? '↑' : '↓'}{Math.abs(delta).toFixed(0)}%</Txt> : null) : <Txt size={0.66 * 15} color={C.sub} style={{ textAlign: 'center' }}>{sub}</Txt>}
    </View>
  );
}
