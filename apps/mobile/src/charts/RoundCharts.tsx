// The three round charts from the Analytics design, drawn with react-native-svg so they look the same on phone, TV and web:
// Reaction Time Through the Round (value and moving average), Performance Trends (three axes) and the distribution histogram.

import { useId, useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { C, F } from '../theme/tokens';
import { glassSurface } from '../theme/surfaces';
import { useDevice } from '../theme/device';
import { useReveal } from '../ui/motion';
import { Txt } from '../ui/Txt';
import type { ChartRow } from '../lib/roundStats';
import { fmtClock } from '../lib/roundStats';


/** d3's monotone-X curve through the points, as an SVG path. */
function monotone(pts: [number, number][], move = true): string {
  const n = pts.length;
  if (!n) return '';
  const f = (v: number) => v.toFixed(2);
  if (n === 1) return `${move ? 'M' : 'L'}${f(pts[0]![0])},${f(pts[0]![1])}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]![0] - pts[i]![0]);
    m.push((pts[i + 1]![1] - pts[i]![1]) / (dx[i] || 1));
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i]! / m[i]!;
      const b = t[i + 1]! / m[i]!;
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i]!;
        t[i + 1] = k * b * m[i]!;
      }
    }
  }
  let d = `${move ? 'M' : 'L'}${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${f(x0 + h)},${f(y0 + t[i]! * h)},${f(x1 - h)},${f(y1 - t[i + 1]! * h)},${f(x1)},${f(y1)}`;
  }
  return d;
}

function useBox(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.max(0, Math.round(e.nativeEvent.layout.width)))];
}

type Ptr = { nativeEvent: { locationX?: number; offsetX?: number } };
const px = (e: Ptr) => (typeof e.nativeEvent.locationX === 'number' ? e.nativeEvent.locationX : (e.nativeEvent.offsetX ?? 0));

/** Mouse hover and touch drag both set the active index. */
function pointerProps(idxAt: (x: number) => number, set: (i: number | null) => void) {
  return {
    onStartShouldSetResponder: () => true,
    onResponderGrant: (e: Ptr) => set(idxAt(px(e))),
    onResponderMove: (e: Ptr) => set(idxAt(px(e))),
    onResponderRelease: () => set(null),
    onPointerMove: (e: unknown) => set(idxAt(px(e as Ptr))),
    onPointerLeave: () => set(null),
  } as const;
}

function ClipReveal({ id, w, h, t }: { id: string; w: number; h: number; t: number }) {
  return (
    <Defs>
      <ClipPath id={id}>
        <Rect x={0} y={0} width={Math.max(0, w * t)} height={h} />
      </ClipPath>
    </Defs>
  );
}

function Tip({ x, w, children, top = 4 }: { x: number; w: number; children: React.ReactNode; top?: number }) {
  const { u } = useDevice();
  const bw = u * 11;
  const left = Math.max(0, Math.min(w - bw, x + 12 > w - bw ? x - bw - 12 : x + 12));
  return (
    <View pointerEvents="none" style={[{ position: 'absolute', top, left, width: bw, borderRadius: u, paddingHorizontal: u * 0.75, paddingVertical: u * 0.5 }, glassSurface(u, true)]}>
      {children}
    </View>
  );
}

function TipRow({ k, v, color, bad }: { k: string; v: string; color?: string; bad?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 14 }}>
      <Txt size={11.1} color={color ?? C.sub}>{k}</Txt>
      <Txt v="bodyStrong" size={11.1} color={bad ? '#FF4778' : color ?? C.text} style={{ fontVariant: ['tabular-nums'] }}>{v}</Txt>
    </View>
  );
}

const Y400 = [0, 400, 800, 1200];

export function RoundChart({ rows, height, revealKey }: { rows: ChartRow[]; height: number; revealKey: string }) {
  const [w, onLayout] = useBox();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = useReveal(2400, revealKey);
  const m = { top: 8, right: 12, left: 0, bottom: 16 };
  const yAxisW = 38;
  const xAxisH = 30;
  const L = m.left + yAxisW;
  const R = w - m.right;
  const T = m.top;
  const B = height - m.bottom - xAxisH;
  const n = rows.length;
  const X = (i: number) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const Y = (v: number) => B - (Math.min(1200, Math.max(0, v)) / 1200) * (B - T);
  const timed = rows.map((r, i) => ({ r, i })).filter((q) => q.r.rt !== null);
  const rtPts = timed.map(({ r, i }) => [X(i), Y(r.rt as number)] as [number, number]);
  const maPts = rows.map((r, i) => [X(i), Y(r.ma)] as [number, number]);
  const idxAt = (x: number) => Math.max(0, Math.min(n - 1, Math.round(((x - L) / Math.max(1, R - L)) * (n - 1))));
  const hv = hover !== null ? rows[hover] : undefined;
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessibilityRole="image" accessibilityLabel="Reaction time of each target through the round" {...pointerProps(idxAt, setHover)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <ClipReveal id={`c${id}`} w={w} h={height} t={t} />
          <G clipPath={`url(#c${id})`}>
            {Y400.map((v) => <Line key={v} x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />)}
            {rows.map((_, i) => <Line key={i} x1={X(i)} x2={X(i)} y1={T} y2={B} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />)}
            {Y400.map((v) => <SvgText key={v} x={L - 8} y={Y(v) + 4} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="end">{v}</SvgText>)}
            {rows.map((r, i) => (i % Math.max(1, Math.ceil(22 / Math.max(1, (R - L) / Math.max(1, n - 1)))) === 0 ? <SvgText key={i} x={X(i)} y={B + 16} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="middle">{r.n}</SvgText> : null))}
            <SvgText x={(L + R) / 2} y={height - 5} fill={C.sub} fontSize={11} fontFamily={F.body} textAnchor="middle">Target Number</SvgText>
            {n > 1 ? <Path d={monotone(maPts)} stroke="#35C7FF" strokeWidth={2} fill="none" /> : null}
            {rtPts.length > 1 ? <Path d={monotone(rtPts)} stroke="#B84AFF" strokeWidth={2} fill="none" /> : null}
            {rtPts.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={3.5} fill="#B84AFF" stroke="#B84AFF" />)}
          </G>
          {hover !== null && hv ? (
            <>
              <Line x1={X(hover)} x2={X(hover)} y1={T} y2={B} stroke="#B84AFF" strokeWidth={1} strokeDasharray="3 3" />
              {hv.rt !== null ? <Circle cx={X(hover)} cy={Y(hv.rt)} r={5} fill="#fff" stroke="#B84AFF" strokeWidth={1} /> : null}
            </>
          ) : null}
        </Svg>
      ) : null}
      {hover !== null && hv ? (
        <Tip x={X(hover)} w={w}>
          <Txt v="bodyStrong" size={11.1} style={{ marginBottom: 4 }}>Target {hv.n}</Txt>
          <TipRow k="Reaction Time" v={hv.rt === null ? 'No press' : `${hv.rt} ms`} />
          <TipRow k="Moving Avg" v={`${hv.ma} ms`} />
          <TipRow k="Accuracy" v={hv.hit ? '100%' : '0% (Miss)'} bad={!hv.hit} />
          <TipRow k="Time" v={fmtClock(hv.at)} />
        </Tip>
      ) : null}
    </View>
  );
}

export function TrendChart({ rows, height, revealKey }: { rows: ChartRow[]; height: number; revealKey: string }) {
  const [w, onLayout] = useBox();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = useReveal(2400, revealKey);
  const m = { top: 6, right: 4, left: 0, bottom: 16 };
  const L = m.left + 38;
  const R = w - m.right - 30;
  const T = m.top;
  const B = height - m.bottom - 30;
  const n = rows.length;
  const X = (i: number) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const yl = (v: number) => B - (Math.min(1200, Math.max(0, v)) / 1200) * (B - T);
  const yr = (v: number) => B - (Math.min(100, Math.max(0, v)) / 100) * (B - T);
  const ys = (v: number) => B - (Math.min(6, Math.max(0, v)) / 6) * (B - T);
  const series = [
    { name: 'Reaction Time (ms)', stroke: '#B84AFF', fill: 'rgba(148,0,211,.22)', y: yl, get: (r: ChartRow) => r.rt, fmt: (v: number) => String(v) },
    { name: 'Accuracy (%)', stroke: '#35C7FF', fill: 'rgba(53,199,255,.10)', y: yr, get: (r: ChartRow) => r.acc, fmt: (v: number) => String(v) },
    { name: 'Speed (targets/s)', stroke: '#FF4778', fill: 'rgba(255,71,120,.08)', y: ys, get: (r: ChartRow) => r.sp, fmt: (v: number) => String(v) },
  ];
  const idxAt = (x: number) => Math.max(0, Math.min(n - 1, Math.round(((x - L) / Math.max(1, R - L)) * (n - 1))));
  const hv = hover !== null ? rows[hover] : undefined;
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessibilityRole="image" accessibilityLabel="Reaction time, accuracy and speed across the round" {...pointerProps(idxAt, setHover)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <ClipReveal id={`c${id}`} w={w} h={height} t={t} />
          <G clipPath={`url(#c${id})`}>
            {Y400.map((v) => <Line key={v} x1={L} x2={R} y1={yl(v)} y2={yl(v)} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />)}
            {rows.map((_, i) => <Line key={i} x1={X(i)} x2={X(i)} y1={T} y2={B} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />)}
            {Y400.map((v) => <SvgText key={v} x={L - 8} y={yl(v) + 4} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="end">{v}</SvgText>)}
            {[0, 50, 100].map((v) => <SvgText key={v} x={R + 8} y={yr(v) + 4} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="start">{v}</SvgText>)}
            {rows.map((r, i) => (i % Math.max(1, Math.ceil(22 / Math.max(1, (R - L) / Math.max(1, n - 1)))) === 0 ? <SvgText key={i} x={X(i)} y={B + 16} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="middle">{r.n}</SvgText> : null))}
            <SvgText x={(L + R) / 2} y={height - 5} fill={C.sub} fontSize={11} fontFamily={F.body} textAnchor="middle">Target Number</SvgText>
            {series.map((s) => {
              const pts = rows.map((r, i) => ({ v: s.get(r), i })).filter((q): q is { v: number; i: number } => q.v !== null).map(({ v, i }) => [X(i), s.y(v)] as [number, number]);
              if (pts.length < 2) return null;
              const line = monotone(pts);
              return (
                <G key={s.name}>
                  <Path d={`${line}L${pts[pts.length - 1]![0].toFixed(2)},${B}L${pts[0]![0].toFixed(2)},${B}Z`} fill={s.fill} />
                  <Path d={line} stroke={s.stroke} strokeWidth={2} fill="none" />
                  {pts.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={2.5} fill={s.stroke} stroke={s.stroke} />)}
                </G>
              );
            })}
          </G>
          {hover !== null ? <Line x1={X(hover)} x2={X(hover)} y1={T} y2={B} stroke="#B84AFF" strokeWidth={1} strokeDasharray="3 3" /> : null}
        </Svg>
      ) : null}
      {hover !== null && hv ? (
        <Tip x={X(hover)} w={w}>
          <Txt v="bodyStrong" size={11.1} style={{ marginBottom: 4 }}>Target {hv.n}</Txt>
          {series.map((s) => {
            const v = s.get(hv);
            return <TipRow key={s.name} k={s.name} v={v === null ? '--' : s.fmt(v)} color={s.stroke} />;
          })}
        </Tip>
      ) : null}
    </View>
  );
}

const niceTicks = (max: number): number[] => {
  const top = Math.max(1, max);
  const raw = top / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = Math.max(1, [1, 2, 5, 10].map((f) => f * mag).find((v) => v >= raw) ?? mag * 10);
  const out: number[] = [];
  for (let v = 0; v <= Math.ceil(top / step) * step; v += step) out.push(v);
  return out;
};

export function HistChart({ bins, height, revealKey }: { bins: { x: number; c: number }[]; height: number; revealKey: string }) {
  const [w, onLayout] = useBox();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = useReveal(2400, revealKey);
  const m = { top: 4, right: 4, left: 0, bottom: 14 };
  const L = m.left + 36;
  const R = w - m.right;
  const T = m.top;
  const B = height - m.bottom - 30;
  const n = bins.length;
  const ticks = niceTicks(Math.max(...bins.map((b) => b.c), 0));
  const top = ticks[ticks.length - 1]!;
  const Y = (v: number) => B - (v / top) * (B - T);
  const slot = (R - L) / n;
  const gap = 2;
  const idxAt = (x: number) => Math.max(0, Math.min(n - 1, Math.floor((x - L) / Math.max(1, slot))));
  const hb = hover !== null ? bins[hover] : undefined;
  return (
    <View onLayout={onLayout} style={{ height, width: '100%' }} accessibilityRole="image" accessibilityLabel="Distribution of reaction times" {...pointerProps(idxAt, setHover)}>
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={`hg${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#7a4bff" />
              <Stop offset="1" stopColor="#3a22b8" />
            </LinearGradient>
          </Defs>
          <ClipReveal id={`c${id}`} w={w} h={height} t={t} />
          <G clipPath={`url(#c${id})`}>
            {ticks.map((v) => <Line key={v} x1={L} x2={R} y1={Y(v)} y2={Y(v)} stroke={C.grid} strokeWidth={1} strokeDasharray="2 4" />)}
            {ticks.map((v) => <SvgText key={v} x={L - 6} y={Y(v) + 4} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="end">{v}</SvgText>)}
            {hover !== null ? <Rect x={L + hover * slot} y={T} width={slot} height={B - T} fill={C.grid} /> : null}
            {bins.map((b, i) => {
              const h = (b.c / top) * (B - T);
              const x = L + i * slot + gap / 2;
              const bw = Math.max(1, slot - gap);
              const r = Math.min(3, bw / 2, h);
              const y = B - h;
              return h > 0 ? (
                <Path key={b.x} d={`M${x},${B}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${B}Z`} fill={`url(#hg${id})`} />
              ) : null;
            })}
            {bins.map((b, i) => (i % 2 === 0 ? <SvgText key={b.x} x={L + i * slot + slot / 2} y={B + 16} fill={C.faint} fontSize={11} fontFamily={F.body} textAnchor="middle">{b.x}</SvgText> : null))}
          </G>
        </Svg>
      ) : null}
      {hover !== null && hb ? (
        <Tip x={L + hover * slot + slot / 2} w={w}>
          <Txt v="bodyStrong" size={11.1} style={{ marginBottom: 4 }}>{hb.x}–{hb.x + 99} ms</Txt>
          <TipRow k="Targets" v={String(hb.c)} />
        </Tip>
      ) : null}
    </View>
  );
}

export interface WeekSeries { name: string; data: (number | null)[]; color: string; axis: 0 | 1 | 2; dash?: boolean }

/** The Players "Performance" chart: weekly average and fastest reaction, accuracy (own right axis) and misses (dashed, third axis). */
export function WeekChart({ labels, series, height, revealKey }: { labels: string[]; series: WeekSeries[]; height: number; revealKey: string }) {
  const { u } = useDevice();
  const [w, onLayout] = useBox();
  const [hover, setHover] = useState<number | null>(null);
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const t = useReveal(3200, revealKey);
  const three = series.some((s) => s.axis === 2);
  const n = labels.length;
  const fs = Math.max(9, Math.round(u * 0.72));
  const yw = Math.round(u * 2.6);
  const L = 2 + yw;
  const R = w - 6 - yw - (three ? Math.round(yw * 0.8) : 0);
  const T = 8;
  const B = height - 2 - fs - 8;
  const X = (i: number) => (n <= 1 ? (L + R) / 2 : L + (i / (n - 1)) * (R - L));
  const doms = [0, 1, 2].map((ax) => {
    const v = series.filter((s) => s.axis === ax).flatMap((s) => s.data).filter((x): x is number => x !== null);
    const pad = ax === 0 ? 12 : ax === 1 ? 1.5 : 1;
    if (!v.length) return [0, 1] as [number, number];
    return [Math.min(...v) - pad, Math.max(...v) + pad] as [number, number];
  });
  const Y = (ax: number, v: number) => B - ((v - doms[ax]![0]) / (doms[ax]![1] - doms[ax]![0] || 1)) * (B - T);
  const ticks = (ax: number) => [0, 1, 2, 3].map((k) => doms[ax]![0] + ((doms[ax]![1] - doms[ax]![0]) * k) / 3);
  const idxAt = (x: number) => Math.max(0, Math.min(n - 1, Math.round(((x - L) / Math.max(1, R - L)) * (n - 1))));
  const first = series[0];
  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: u, rowGap: u * 0.25, marginBottom: u * 0.5 }}>
        {series.map((s) => (
          <View key={s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.375 }}>
            <View style={{ width: u * 0.875, height: 3, borderRadius: 2, backgroundColor: s.color }} />
            <Txt v="bodyStrong" size={0.78 * 15} color="#A2AEC5">{s.name}</Txt>
          </View>
        ))}
      </View>
      <View onLayout={onLayout} style={{ height, width: '100%' }} {...pointerProps(idxAt, setHover)} accessibilityRole="image" accessibilityLabel="Weekly performance: reaction time, accuracy and misses">
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Defs>
              <ClipPath id={`wc${id}`}><Rect x={0} y={0} width={Math.max(0, w * t)} height={height} /></ClipPath>
              <LinearGradient id={`wa${id}`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#35C7FF" stopOpacity={0.22} />
                <Stop offset="0.65" stopColor="#5594ff" stopOpacity={0.06} />
                <Stop offset="1" stopColor="#5594ff" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`wl${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#8af2fb" />
                <Stop offset="1" stopColor="#35C7FF" />
              </LinearGradient>
            </Defs>
            <G clipPath={`url(#wc${id})`}>
              {ticks(0).map((v, k) => <Line key={k} x1={L} x2={R} y1={Y(0, v)} y2={Y(0, v)} stroke={C.grid} strokeWidth={1} />)}
              {ticks(0).map((v, k) => <SvgText key={'l' + k} x={L - 6} y={Y(0, v) + fs / 3} fill={C.faint} fontSize={fs} fontWeight="500" fontFamily={F.body} textAnchor="end">{Math.round(v)}</SvgText>)}
              {ticks(1).map((v, k) => <SvgText key={'r' + k} x={R + 6} y={Y(1, v) + fs / 3} fill={C.faint} fontSize={fs} fontWeight="500" fontFamily={F.body} textAnchor="start">{Math.round(v)}</SvgText>)}
              {three ? ticks(2).map((v, k) => <SvgText key={'m' + k} x={R + 6 + yw} y={Y(2, v) + fs / 3} fill={C.faint} fontSize={fs} fontWeight="500" fontFamily={F.body} textAnchor="start">{Math.round(v)}</SvgText>) : null}
              {labels.map((lab, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) ? <SvgText key={i} x={X(i)} y={height - 4} fill={C.faint} fontSize={fs} fontWeight="500" fontFamily={F.body} textAnchor="middle">{lab}</SvgText> : null)}
              {series.map((s, si) => {
                const pts = s.data.map((v, i) => (v === null ? null : ([X(i), Y(s.axis, v)] as [number, number]))).filter((p): p is [number, number] => p !== null);
                if (pts.length < 2) return pts.length === 1 ? <Circle key={s.name} cx={pts[0]![0]} cy={pts[0]![1]} r={3} fill={s.color} /> : null;
                const line = monotone(pts);
                return si === 0 && first ? (
                  <G key={s.name}>
                    <Path d={`${line}L${pts[pts.length - 1]![0].toFixed(2)},${B}L${pts[0]![0].toFixed(2)},${B}Z`} fill={`url(#wa${id})`} />
                    <Path d={line} stroke={`url(#wl${id})`} strokeWidth={1.9} fill="none" />
                  </G>
                ) : (
                  <Path key={s.name} d={line} stroke={s.color} strokeWidth={1.6} strokeDasharray={s.dash ? '5 5' : undefined} fill="none" />
                );
              })}
            </G>
            {hover !== null ? <Line x1={X(hover)} x2={X(hover)} y1={T} y2={B} stroke={C.borderStrong} strokeWidth={1} /> : null}
            {hover !== null ? series.map((s) => { const v = s.data[hover]; return v === null || v === undefined ? null : <Circle key={s.name} cx={X(hover)} cy={Y(s.axis, v)} r={4} fill={s.color} />; }) : null}
          </Svg>
        ) : null}
        {hover !== null ? (
          <Tip x={X(hover)} w={w}>
            <Txt v="bodyStrong" size={0.82 * 15} color="#fff" style={{ marginBottom: 4 }}>{labels[hover]}</Txt>
            {series.map((s) => <TipRow key={s.name} k={s.name} v={s.data[hover] === null || s.data[hover] === undefined ? '--' : String(s.data[hover])} color={s.color} />)}
          </Tip>
        ) : null}
      </View>
    </View>
  );
}