// Progress, the way gym apps show it: a bar chart per day (last 7 days) or per week (last 8 weeks), and a card that compares
// the latest day with the day before, or this week with last week, with an up or down arrow for each figure.
// Everything is worked out from the player's finished rounds; nothing is stored separately.

import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { View } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';
import type { SessionDTO } from '@nboard/shared';
import { C, F } from '../theme/tokens';
import { useDevice } from '../theme/device';
import { Card } from './Card';
import { Empty, Seg, X } from './Bits';

type Mode = 'day' | 'week';
type MetricKey = 'rounds' | 'rt' | 'acc';

interface Bucket {
  label: string;
  from: number;
  to: number;
  rounds: number;
  rt: number | null;
  acc: number | null;
  best: number | null;
  hits: number;
}

const DAY = 86_400_000;
const dayStart = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
const weekStart = (t: number) => { const s = new Date(dayStart(t)); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s.getTime(); };
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

function fill(items: SessionDTO[], from: number, to: number, label: string): Bucket {
  const mine = items.filter((s) => { const t = new Date(s.started_at).getTime(); return t >= from && t < to && s.summary; });
  const sm = mine.map((s) => s.summary!);
  const nums = (f: (m: (typeof sm)[number]) => number | null | undefined) => sm.map(f).filter((x): x is number => typeof x === 'number');
  const best = nums((m) => m.best_rt);
  return {
    label,
    from,
    to,
    rounds: mine.length,
    rt: avg(nums((m) => m.avg_rt)),
    acc: avg(nums((m) => m.accuracy)),
    best: best.length ? Math.min(...best) : null,
    hits: sm.reduce((n, m) => n + (m.correct_hits ?? 0), 0),
  };
}

function buckets(items: SessionDTO[], mode: Mode, now: number): Bucket[] {
  const out: Bucket[] = [];
  if (mode === 'day') {
    const today = dayStart(now);
    for (let i = 6; i >= 0; i--) {
      const from = today - i * DAY;
      const to = new Date(from); to.setDate(to.getDate() + 1);
      out.push(fill(items, from, to.getTime(), i === 0 ? 'Today' : new Date(from).toLocaleDateString(undefined, { weekday: 'short' })));
    }
  } else {
    const thisWeek = weekStart(now);
    for (let i = 7; i >= 0; i--) {
      const f = new Date(thisWeek); f.setDate(f.getDate() - i * 7);
      const t = new Date(f); t.setDate(t.getDate() + 7);
      out.push(fill(items, f.getTime(), t.getTime(), i === 0 ? 'This' : f.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })));
    }
  }
  return out;
}

const fmt = (v: number | null, unit = '', dec = 0) => (v === null ? '--' : `${+v.toFixed(dec)}${unit}`);

interface Row { k: string; cur: string; prev: string; delta: string; good: boolean | null }

function compareRows(a: Bucket, b: Bucket): Row[] {
  const diff = (x: number | null, y: number | null, unit: string, dec: number, higherBetter: boolean): { delta: string; good: boolean | null } => {
    if (x === null || y === null) return { delta: x === null ? '' : 'New', good: null };
    const d = x - y;
    if (Math.abs(d) < Math.pow(10, -dec) / 2) return { delta: 'Same', good: null };
    return { delta: `${d > 0 ? '↑' : '↓'} ${+Math.abs(d).toFixed(dec)}${unit}`, good: higherBetter ? d > 0 : d < 0 };
  };
  const r = (k: string, x: number | null, y: number | null, unit: string, dec: number, hb: boolean): Row => ({ k, cur: fmt(x, unit, dec), prev: fmt(y, unit, dec), ...diff(x, y, unit === '%' ? ' pts' : unit, dec, hb) });
  return [
    r('Rounds', a.rounds || null, b.rounds || null, '', 0, true),
    r('Avg reaction', a.rt, b.rt, ' ms', 0, false),
    r('Accuracy', a.acc, b.acc, '%', 1, true),
    r('Best reaction', a.best, b.best, ' ms', 0, false),
    r('Hits', a.hits || null, b.hits || null, '', 0, true),
  ];
}

function Bars({ data, metric }: { data: Bucket[]; metric: MetricKey }) {
  const { u } = useDevice();
  const [w, setW] = useState(0);
  const height = u * 11;
  const vals = data.map((b) => (metric === 'rounds' ? (b.rounds || null) : metric === 'rt' ? b.rt : b.acc));
  const top = Math.max(1, ...vals.map((v) => v ?? 0)) * 1.12;
  const padT = 16;
  const padB = 22;
  const slot = w > 0 ? w / data.length : 0;
  const bw = Math.max(6, Math.min(slot * 0.62, u * 3));
  const fs = Math.max(9, Math.round(u * 0.68));
  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height, width: '100%' }} accessibilityRole="image" accessibilityLabel="Progress bars">
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="pbar" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#B84AFF" />
              <Stop offset="1" stopColor="#5b2bd6" />
            </LinearGradient>
            <LinearGradient id="pbarOld" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#7a5cc0" stopOpacity={0.75} />
              <Stop offset="1" stopColor="#3a2a78" stopOpacity={0.75} />
            </LinearGradient>
          </Defs>
          <Line x1={0} x2={w} y1={height - padB} y2={height - padB} stroke={C.grid} strokeWidth={1} />
          {data.map((b, i) => {
            const v = vals[i];
            const cx = slot * i + slot / 2;
            const h = v === null ? 0 : Math.max(3, (v / top) * (height - padT - padB));
            const y = height - padB - h;
            const r = Math.min(4, bw / 2, h);
            const x = cx - bw / 2;
            return (
              <G key={i}>
                {v !== null ? (
                  <Path d={`M${x},${height - padB}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${height - padB}Z`} fill={i === data.length - 1 ? 'url(#pbar)' : 'url(#pbarOld)'} />
                ) : null}
              </G>
            );
          })}
          {data.map((b, i) => {
            const v = vals[i];
            const cx = slot * i + slot / 2;
            const h = v === null ? 0 : Math.max(3, (v / top) * (height - padT - padB));
            return (
              <SvgText key={`v${i}`} x={cx} y={height - padB - h - 4} fill={v === null ? C.faint : C.sub} fontSize={fs} fontFamily={F.body} textAnchor="middle">{v === null ? '' : Math.round(v)}</SvgText>
            );
          })}
          {data.map((b, i) => (
            <SvgText key={`l${i}`} x={slot * i + slot / 2} y={height - 6} fill={i === data.length - 1 ? C.text : C.faint} fontSize={fs} fontFamily={F.body} textAnchor="middle">{b.label}</SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

export function ProgressPanel({ items, gameName, loading }: { items: SessionDTO[]; gameName: string; loading: boolean }) {
  const { u } = useDevice();
  const [mode, setMode] = useState<Mode>('week');
  const [metric, setMetric] = useState<MetricKey>('rounds');
  const now = Date.now();
  const data = useMemo(() => buckets(items, mode, now), [items, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Weekly: this week against last week. Daily: the latest day played against the day played before it.
  let cur: Bucket | null = null;
  let prev: Bucket | null = null;
  let curLabel = '';
  let prevLabel = '';
  if (mode === 'week') {
    cur = data[data.length - 1]!;
    prev = data[data.length - 2]!;
    curLabel = 'This week';
    prevLabel = 'Last week';
  } else {
    const played = data.filter((b) => b.rounds > 0);
    cur = played[played.length - 1] ?? null;
    prev = played[played.length - 2] ?? null;
    curLabel = cur ? (cur.label === 'Today' ? 'Today' : cur.label) : '';
    prevLabel = prev ? prev.label : '';
  }
  const rows = cur && prev ? compareRows(cur, prev) : [];
  const weekDays = useMemo(() => {
    const ws = weekStart(now);
    const set = new Set(items.filter((s) => new Date(s.started_at).getTime() >= ws).map((s) => dayStart(new Date(s.started_at).getTime())));
    return set.size;
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loading && items.length === 0) return <Empty>No {gameName} rounds yet. Progress appears after the first round.</Empty>;

  return (
    <View style={{ gap: u * 0.75 }}>
      <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.5 }}>
          <View style={{ flexShrink: 1 }}>
            <X s={0.85} w="b" up>Progress · {gameName}</X>
            <X s={0.7} c={C.sub}>{mode === 'week' ? 'Last 8 weeks' : 'Last 7 days'}</X>
          </View>
          <Seg<Mode> items={[['day', 'Daily'], ['week', 'Weekly']]} value={mode} onChange={setMode} />
        </View>
        <View style={{ marginBottom: u * 0.5 }}>
          <Seg<MetricKey> items={[['rounds', 'Rounds'], ['rt', 'Avg reaction'], ['acc', 'Accuracy']]} value={metric} onChange={setMetric} />
        </View>
        <Bars data={data} metric={metric} />
        <X s={0.66} c={C.faint} style={{ marginTop: u * 0.25 }}>
          {metric === 'rounds' ? 'Rounds played' : metric === 'rt' ? 'Average reaction in ms (shorter bar is faster)' : 'Accuracy in %'} · {weekDays} {weekDays === 1 ? 'day' : 'days'} trained this week
        </X>
      </Card>

      <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
        <View style={{ marginBottom: u * 0.5 }}>
          <X s={0.85} w="b" up>{mode === 'week' ? 'This week vs last week' : 'Latest day vs the day before'}</X>
          {cur && prev ? <X s={0.7} c={C.sub}>{curLabel} against {prevLabel}</X> : null}
        </View>
        {rows.length ? (
          <View style={{ gap: u * 0.375 }}>
            <View style={{ flexDirection: 'row', gap: u * 0.5, paddingHorizontal: u * 0.25 }}>
              <X s={0.62} w="b" up c={C.faint} style={{ flex: 1.3 }}>Measure</X>
              <X s={0.62} w="b" up c={C.faint} style={{ flex: 1, textAlign: 'right' }}>{curLabel}</X>
              <X s={0.62} w="b" up c={C.faint} style={{ flex: 1, textAlign: 'right' }}>{prevLabel}</X>
              <X s={0.62} w="b" up c={C.faint} style={{ flex: 1.1, textAlign: 'right' }}>Change</X>
            </View>
            {rows.map((r) => (
              <View key={r.k} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingHorizontal: u * 0.25, paddingVertical: u * 0.375, borderRadius: u, backgroundColor: C.tint }}>
                <X s={0.8} w="m" style={{ flex: 1.3 }} numberOfLines={1}>{r.k}</X>
                <X s={0.8} w="b" num style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{r.cur}</X>
                <X s={0.8} num c={C.sub} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{r.prev}</X>
                <X s={0.8} w="b" num c={r.good === null ? C.sub : r.good ? C.success : C.danger} style={{ flex: 1.1, textAlign: 'right' }} numberOfLines={1}>{r.delta || '--'}</X>
              </View>
            ))}
            <X s={0.66} c={C.faint} style={{ marginTop: u * 0.25 }}>Green is better than the earlier period, red is worse. Shorter reaction time is better.</X>
          </View>
        ) : (
          <Empty>{mode === 'week' ? `No rounds in the last two weeks yet.` : `Needs two days with ${gameName} rounds to compare.`}</Empty>
        )}
      </Card>
    </View>
  );
}