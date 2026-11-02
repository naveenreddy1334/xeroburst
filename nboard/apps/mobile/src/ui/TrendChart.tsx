// A multi-line trend chart for money over time (revenue, expenses, profit). Draws on every platform with react-native-svg.
// Press or hover a month to read its figures. Gaps (no data recorded) break the line; nothing is joined across them.

import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import { C, F } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { rupees } from '../lib/format';
import { X } from './Bits';

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
  /** a soft fill under the line */
  area?: boolean;
  dash?: string;
}

const compact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 100000 ? `${Math.round(a / 10000) / 10}L` : a >= 1000 ? `${Math.round(a / 100) / 10}k` : String(a);
  return `${n < 0 ? '-' : ''}${s}`;
};

const niceStep = (span: number, parts: number) => {
  const raw = span / parts;
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
};

export function TrendChart({ labels, longLabels, series, selected: sel, height }: { labels: string[]; longLabels: string[]; series: TrendSeries[]; selected?: number; height?: number }) {
  const { u } = useDevice();
  const [w, setW] = useState(320);
  const [pick, setPick] = useState<number | null>(null);
  const n = labels.length;
  const idx = pick ?? sel ?? n - 1;
  useEffect(() => { setPick(null); }, [n, sel]);
  const h = height ?? Math.max(200, u * 15);
  const padL = 40, padR = 14, padT = 14, padB = 26;
  const innerW = Math.max(40, w - padL - padR);
  const innerH = h - padT - padB;
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const hi0 = Math.max(0, ...all);
  const lo0 = Math.min(0, ...all);
  const step = niceStep(Math.max(1, hi0 - lo0), 4);
  const hi = Math.ceil(hi0 / step) * step || step;
  const lo = Math.floor(lo0 / step) * step;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * innerH;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Math.round(t * 100) / 100);
  const every = innerW / Math.max(1, n) < 46 ? 2 : 1;

  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
      pen = true;
    });
    return d;
  };
  const areaPath = (vals: (number | null)[]) => {
    // one closed shape per unbroken run
    let out = '';
    let run: number[] = [];
    const flush = () => {
      if (run.length > 1) {
        const first = run[0]!, last = run[run.length - 1]!;
        out += run.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)} ${y(vals[i]!).toFixed(1)}`).join(' ') + ` L${x(last).toFixed(1)} ${y(Math.max(0, lo)).toFixed(1)} L${x(first).toFixed(1)} ${y(Math.max(0, lo)).toFixed(1)} Z `;
      }
      run = [];
    };
    vals.forEach((v, i) => (v === null ? flush() : run.push(i)));
    flush();
    return out;
  };

  const summary = series.map((s) => `${s.label} ${s.values[idx] === null || s.values[idx] === undefined ? 'none' : rupees(s.values[idx]!)}`).join(', ');
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: u * 0.9, marginBottom: u * 0.5 }}>
        <X s={0.95} w="b" style={{ minWidth: u * 6 }}>{longLabels[idx] ?? ''}</X>
        {series.map((s) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.35 }}>
            <View style={{ width: u * 0.7, height: u * 0.7, borderRadius: u * 0.35, backgroundColor: s.color }} />
            <X s={0.82} c={C.sub}>{s.label}</X>
            <X s={0.9} w="b" num>{s.values[idx] === null || s.values[idx] === undefined ? '--' : rupees(s.values[idx]!)}</X>
          </View>
        ))}
      </View>
      <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} accessibilityLabel={`${longLabels[idx] ?? ''}: ${summary}`}>
        <Svg width={w} height={h}>
          <Defs>
            {series.map((s) => (
              <LinearGradient key={s.key} id={`tc-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={s.color} stopOpacity={0.28} />
                <Stop offset="1" stopColor={s.color} stopOpacity={0} />
              </LinearGradient>
            ))}
          </Defs>
          {ticks.map((t) => (
            <Line key={`g${t}`} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} stroke={t === 0 ? C.faint : C.border} strokeWidth={t === 0 ? 1.2 : 1} strokeDasharray={t === 0 ? undefined : '3 5'} />
          ))}
          {ticks.map((t) => (
            <SvgText key={`t${t}`} x={padL - 6} y={y(t) + 3.5} fontSize={10} fill={C.faint} textAnchor="end" fontFamily={F.body}>{compact(t)}</SvgText>
          ))}
          {labels.map((l, i) => (i % every === (n - 1) % every ? (
            <SvgText key={`x${i}`} x={x(i)} y={h - 8} fontSize={10} fill={i === idx ? C.text : C.faint} fontWeight={i === idx ? '700' : '400'} textAnchor="middle" fontFamily={F.body}>{l}</SvgText>
          ) : null))}
          <Line x1={x(idx)} x2={x(idx)} y1={padT} y2={padT + innerH} stroke={C.faint} strokeWidth={1} strokeDasharray="2 4" />
          {series.filter((s) => s.area).map((s) => <Path key={`a${s.key}`} d={areaPath(s.values)} fill={`url(#tc-${s.key})`} />)}
          {series.map((s) => <Path key={s.key} d={path(s.values)} stroke={s.color} strokeWidth={s.dash ? 2 : 3} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" fill="none" />)}
          {series.map((s) => (s.values[idx] !== null && s.values[idx] !== undefined ? <Circle key={`d${s.key}`} cx={x(idx)} cy={y(s.values[idx]!)} r={5} fill={s.color} stroke={C.bg} strokeWidth={2} /> : null))}
        </Svg>
        <View style={{ position: 'absolute', left: padL - innerW / Math.max(1, n - 1) / 2, top: 0, width: innerW + innerW / Math.max(1, n - 1), height: h, flexDirection: 'row' }}>
          {labels.map((l, i) => (
            <Pressable key={`${l}${i}`} accessibilityRole="button" accessibilityLabel={`${longLabels[i] ?? l}`} onPress={() => setPick(i)} onHoverIn={() => setPick(i)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
    </View>
  );
}
