// Charts drawn with react-native-svg: small, themed, and they work on every platform including web.

import { useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { C, F, alpha } from '../theme/tokens';
import { Txt } from '../ui/Txt';
import { useDrawIn } from '../ui/motion';

function useWidth(initial = 300): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => setW(Math.max(80, Math.round(e.nativeEvent.layout.width)))];
}

/** Position of a touch, drag or mouse move inside a view (works on phones, tablets and the web). */
function pointerX(e: { nativeEvent: { locationX?: number; offsetX?: number } }): number {
  const n = e.nativeEvent;
  return typeof n.locationX === 'number' ? n.locationX : (n.offsetX ?? 0);
}

function Tip({ x, w, title, value, color }: { x: number; w: number; title?: string; value: string; color: string }) {
  const bw = 112;
  const left = Math.max(0, Math.min(w - bw, x - bw / 2));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: -2, left, width: bw, backgroundColor: C.surface3, borderColor: color, borderWidth: 1, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, alignItems: 'center' }}>
      {title ? <Txt v="small" size={11}>{title}</Txt> : null}
      <Txt v="mono" size={13} color={C.text}>{value}</Txt>
    </View>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
};

interface LineProps {
  data: (number | null)[];
  labels?: string[];
  height?: number;
  color?: string;
  area?: boolean;
  dots?: boolean;
  format?: (n: number) => string;
  /** show the first and last value on the line */
  endLabels?: boolean;
  /** draw a faint line at this value (for example the previous period) */
  reference?: number | null;
  yMin?: number;
  accessibilityLabel?: string;
}

export function LineChart({ data, labels, height = 150, color = C.cyan, area = true, dots, format = (n) => String(Math.round(n)), endLabels, reference, yMin, accessibilityLabel }: LineProps) {
  const [w, onLayout] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const grow = useDrawIn(900, data.length);
  const padL = 8;
  const padR = 8;
  const padT = 14;
  const padB = labels ? 24 : 8;
  const vals = data.filter((d): d is number => d !== null);
  const refs = reference != null ? [reference] : [];
  if (!vals.length) {
    return (
      <View onLayout={onLayout} style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Txt v="small">No data yet</Txt>
      </View>
    );
  }
  const all = [...vals, ...refs];
  let lo = yMin ?? Math.min(...all);
  let hi = Math.max(...all);
  if (hi === lo) {
    hi += 1;
    lo -= 1;
  }
  const span = hi - lo;
  lo -= span * 0.1;
  hi += span * 0.1;
  const innerW = w - padL - padR;
  const innerH = height - padT - padB;
  const x = (i: number) => padL + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * innerH;

  // Lines break at gaps (null).
  let d = '';
  let pen = false;
  const segs: number[][] = [];
  let cur: number[] = [];
  data.forEach((v, i) => {
    if (v === null) {
      if (cur.length) segs.push(cur);
      cur = [];
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
    pen = true;
    cur.push(i);
  });
  if (cur.length) segs.push(cur);
  const areaPath = area
    ? segs
        .filter((s) => s.length > 1)
        .map((s) => `M${x(s[0]!).toFixed(1)} ${(padT + innerH).toFixed(1)} ` + s.map((i) => `L${x(i).toFixed(1)} ${y(data[i] as number).toFixed(1)}`).join(' ') + ` L${x(s[s.length - 1]!).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`)
        .join(' ')
    : '';
  // Length of the line, so it can be drawn from left to right.
  let len = 0;
  {
    let prev: number | null = null;
    data.forEach((v, i) => {
      if (v === null) {
        prev = null;
        return;
      }
      if (prev !== null) len += Math.hypot(x(i) - x(prev), y(v) - y(data[prev] as number));
      prev = i;
    });
  }
  const shownX = padL + innerW * grow;
  const idxAt = (px: number) => {
    if (data.length <= 1) return 0;
    const i = Math.round(((px - padL) / innerW) * (data.length - 1));
    return Math.max(0, Math.min(data.length - 1, i));
  };
  const first = data.findIndex((v) => v !== null);
  const last = data.length - 1 - [...data].reverse().findIndex((v) => v !== null);
  const step = Math.ceil(data.length / 7);

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Line chart'}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => setHover(idxAt(pointerX(e)))}
      onResponderMove={(e) => setHover(idxAt(pointerX(e)))}
      onResponderRelease={() => setHover(null)}
      onPointerMove={(e) => setHover(idxAt(pointerX(e as unknown as Parameters<typeof pointerX>[0])))}
      onPointerLeave={() => setHover(null)}
    >
      <Svg width={w} height={height}>
        <Defs>
          <ClipPath id="draw">
            <Rect x={0} y={0} width={Math.max(0, shownX)} height={height} />
          </ClipPath>
          <LinearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.32} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {[0, 0.5, 1].map((t) => (
          <Line key={t} x1={padL} x2={w - padR} y1={padT + t * innerH} y2={padT + t * innerH} stroke={C.border} strokeWidth={1} strokeDasharray="3 5" />
        ))}
        {reference != null ? <Line x1={padL} x2={w - padR} y1={y(reference)} y2={y(reference)} stroke={C.faint} strokeWidth={1.5} strokeDasharray="6 4" /> : null}
        <G clipPath="url(#draw)">
          {areaPath ? <Path d={areaPath} fill="url(#lg)" /> : null}
          <Path d={d} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {dots || data.length <= 14
            ? data.map((v, i) => (v === null ? null : <Circle key={i} cx={x(i)} cy={y(v)} r={3.2} fill={C.bg} stroke={color} strokeWidth={2} />))
            : null}
        </G>
        {hover !== null && data[hover] !== null && data[hover] !== undefined ? (
          <>
            <Line x1={x(hover)} x2={x(hover)} y1={padT} y2={padT + innerH} stroke={alpha(color, 0.5)} strokeWidth={1} />
            <Circle cx={x(hover)} cy={y(data[hover] as number)} r={5.5} fill={color} stroke={C.bg} strokeWidth={2} />
          </>
        ) : null}
        {endLabels && first >= 0 && grow > 0.95 ? (
          <>
            <SvgText x={x(first)} y={y(data[first] as number) - 8} fill={C.sub} fontSize={11} fontFamily={F.mono} textAnchor="start">
              {format(data[first] as number)}
            </SvgText>
            {last !== first ? (
              <SvgText x={x(last)} y={y(data[last] as number) - 8} fill={color} fontSize={11} fontFamily={F.mono} textAnchor="end">
                {format(data[last] as number)}
              </SvgText>
            ) : null}
          </>
        ) : null}
        {labels
          ? labels.map((l, i) =>
              i % step === 0 || i === labels.length - 1 ? (
                <SvgText key={i} x={x(i)} y={height - 6} fill={C.sub} fontSize={11} fontFamily={F.body} textAnchor="middle">
                  {l}
                </SvgText>
              ) : null,
            )
          : null}
      </Svg>
      {hover !== null && data[hover] !== null && data[hover] !== undefined ? <Tip x={x(hover)} w={w} title={labels?.[hover] ?? `#${hover + 1}`} value={format(data[hover] as number)} color={color} /> : null}
    </View>
  );
}

interface BarProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  color?: string;
  format?: (n: number) => string;
  accessibilityLabel?: string;
}

export function BarChart({ data, height = 150, color = C.cyan, format = (n) => String(Math.round(n)), accessibilityLabel }: BarProps) {
  const [w, onLayout] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const grow = useDrawIn(750, data.length);
  const padT = 18;
  const padB = 24;
  const innerH = height - padT - padB;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const gap = data.length > 16 ? 2 : 6;
  const bw = Math.max(3, (w - gap * (data.length - 1)) / data.length);
  const step = Math.ceil(data.length / 8);
  const idxAt = (px: number) => Math.max(0, Math.min(data.length - 1, Math.floor(px / (bw + gap))));
  return (
    <View
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Bar chart'}
      onStartShouldSetResponder={() => true}
      onResponderGrant={(e) => setHover(idxAt(pointerX(e)))}
      onResponderMove={(e) => setHover(idxAt(pointerX(e)))}
      onResponderRelease={() => setHover(null)}
      onPointerMove={(e) => setHover(idxAt(pointerX(e as unknown as Parameters<typeof pointerX>[0])))}
      onPointerLeave={() => setHover(null)}
    >
      <Svg width={w} height={height}>
        <Line x1={0} x2={w} y1={padT + innerH} y2={padT + innerH} stroke={C.border} strokeWidth={1.5} />
        {data.map((d, i) => {
          const h = (d.value / max) * innerH * grow;
          const bx = i * (bw + gap);
          return (
            <G key={i}>
              <Rect x={bx} y={padT + innerH - Math.max(h, d.value > 0 ? 3 : 0)} width={bw} height={Math.max(h, d.value > 0 ? 3 : 0)} rx={Math.min(5, bw / 2)} fill={d.color ?? color} opacity={d.value > 0 ? (hover === null || hover === i ? 1 : 0.55) : 0.2} />
              {d.value > 0 && data.length <= 10 && grow > 0.95 ? (
                <SvgText x={bx + bw / 2} y={padT + innerH - h - 5} fill={C.text} fontSize={11} fontFamily={F.mono} textAnchor="middle">
                  {format(d.value)}
                </SvgText>
              ) : null}
              {i % step === 0 ? (
                <SvgText x={bx + bw / 2} y={height - 6} fill={C.sub} fontSize={11} fontFamily={F.body} textAnchor="middle">
                  {d.label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </Svg>
      {hover !== null && data[hover] ? <Tip x={hover * (bw + gap) + bw / 2} w={w} title={data[hover]!.label} value={format(data[hover]!.value)} color={data[hover]!.color ?? color} /> : null}
    </View>
  );
}

export function Ring({ value, size = 96, stroke = 10, color = C.cyan, children }: { value: number; size?: number; stroke?: number; color?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) * useDrawIn(900, value);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={alpha(color, 0.16)} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

export function Sparkline({ data, color = C.cyan, width = 90, height = 28 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const span = hi - lo || 1;
  const pts = data.map((v, i) => `${i === 0 ? 'M' : 'L'}${((i / (data.length - 1)) * (width - 4) + 2).toFixed(1)} ${(height - 3 - ((v - lo) / span) * (height - 6)).toFixed(1)}`).join(' ');
  return (
    <Svg width={width} height={height}>
      <Path d={pts} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Endurance: reaction time across the round. Rising means the player slowed down. */
export function FatigueCurve({ curve, height = 160 }: { curve: { t_s: number; rt: number }[]; height?: number }) {
  return (
    <LineChart
      data={curve.map((c) => c.rt)}
      labels={curve.map((c) => `${c.t_s}s`)}
      height={height}
      color={C.danger}
      endLabels
      format={(n) => `${Math.round(n)}ms`}
      accessibilityLabel="Fatigue curve: reaction time over the round"
    />
  );
}
