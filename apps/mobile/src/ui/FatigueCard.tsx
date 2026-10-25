// "Pace and fatigue" for one round: the reaction times are split into a start, a middle and an end, so a coach can see whether
// the player slowed down as the round went on, and where the slowest stretch was. Worked out here from the round's own targets.

import { View } from 'react-native';
import { C, INK } from '../theme/tokens';
import { useDevice } from '../theme/device';
import type { Target } from '../lib/roundStats';
import { Card } from './Card';
import { Pill, X } from './Bits';

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export interface Pace {
  parts: { label: string; rt: number | null; misses: number; count: number }[];
  change: number | null;
  verdict: 'faster' | 'steady' | 'slight' | 'clear';
  slowest: { from: number; to: number; rt: number } | null;
}

/** Needs at least 9 targets with a measured reaction time. */
export function paceOf(targets: Target[]): Pace | null {
  const timed = targets.filter((t) => t.rt !== null);
  if (timed.length < 9) return null;
  const size = Math.ceil(targets.length / 3);
  const names = ['Start', 'Middle', 'End'];
  const parts = names.map((label, i) => {
    const chunk = targets.slice(i * size, (i + 1) * size);
    return { label, rt: avg(chunk.filter((t) => t.rt !== null).map((t) => t.rt as number)), misses: chunk.filter((t) => !t.hit).length, count: chunk.length };
  });
  const a = parts[0]!.rt;
  const c = parts[2]!.rt;
  const change = a !== null && c !== null && a > 0 ? ((c - a) / a) * 100 : null;
  let slowest: Pace['slowest'] = null;
  const win = 5;
  for (let i = 0; i + win <= timed.length; i++) {
    const m = avg(timed.slice(i, i + win).map((t) => t.rt as number))!;
    if (!slowest || m > slowest.rt) slowest = { from: timed[i]!.n, to: timed[i + win - 1]!.n, rt: Math.round(m) };
  }
  const verdict: Pace['verdict'] = change === null ? 'steady' : change <= -3 ? 'faster' : change < 5 ? 'steady' : change < 12 ? 'slight' : 'clear';
  return { parts, change, verdict, slowest };
}

const TEXT: Record<Pace['verdict'], { tag: string; tone: 'good' | 'warn' | ''; line: string; tip: string }> = {
  faster: { tag: 'Warmed up', tone: 'good', line: 'Reactions got faster as the round went on.', tip: 'A short warm-up before the first round may help this player start at full speed.' },
  steady: { tag: 'Steady pace', tone: 'good', line: 'The pace held from start to finish.', tip: 'Good stamina for this level. Try the next level, or a longer round.' },
  slight: { tag: 'Slight fade', tone: 'warn', line: 'The last third was a little slower than the start.', tip: 'Add a 30-second pause halfway, or keep rounds shorter until the pace holds.' },
  clear: { tag: 'Clear fade', tone: 'warn', line: 'The last third was clearly slower than the start.', tip: 'Likely tiredness or loss of focus. Shorter rounds with rests, and build up slowly.' },
};

export function FatigueCard({ targets }: { targets: Target[] }) {
  const { u } = useDevice();
  const pace = paceOf(targets);
  if (!pace) {
    return (
      <Card pad={0.75} style={{ borderRadius: u * 1.6 }}>
        <X s={0.85} w="b" up>Pace and fatigue</X>
        <X s={0.85} c={C.sub} style={{ marginTop: u * 0.375 }}>Needs a round with at least 9 timed targets.</X>
      </Card>
    );
  }
  const t = TEXT[pace.verdict];
  const hi = Math.max(...pace.parts.map((p) => p.rt ?? 0), 1);
  return (
    <Card pad={0.75} style={{ borderRadius: u * 1.6 }} testID="fatigue-card">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5, marginBottom: u * 0.5 }}>
        <X s={0.85} w="b" up>Pace and fatigue</X>
        <Pill t={t.tone}>{t.tag}</Pill>
      </View>
      <View style={{ gap: u * 0.5 }}>
        {pace.parts.map((p, i) => (
          <View key={p.label} style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.625 }}>
            <X s={0.8} c={C.sub} style={{ width: u * 4.5 }}>{p.label}</X>
            <View style={{ flex: 1, height: u * 1.1, borderRadius: u * 0.55, backgroundColor: C.tint, overflow: 'hidden' }}>
              <View style={{ width: `${Math.max(4, ((p.rt ?? 0) / hi) * 100)}%`, height: '100%', borderRadius: u * 0.55, backgroundColor: i === 2 && pace.verdict !== 'steady' && pace.verdict !== 'faster' ? '#FF9E5E' : INK.line }} />
            </View>
            <X s={0.8} w="b" num style={{ width: u * 7 }} numberOfLines={1}>{p.rt === null ? '--' : `${Math.round(p.rt)} ms`}</X>
          </View>
        ))}
      </View>
      <X s={0.88} w="m" style={{ marginTop: u * 0.75 }}>
        {t.line}{pace.change !== null ? ` End vs start: ${pace.change > 0 ? '+' : ''}${pace.change.toFixed(0)}%.` : ''}
      </X>
      {pace.slowest ? <X s={0.8} c={C.sub} style={{ marginTop: u * 0.25 }}>Slowest stretch: targets {pace.slowest.from} to {pace.slowest.to} (average {pace.slowest.rt} ms).</X> : null}
      <X s={0.8} c={C.sub} style={{ marginTop: u * 0.25 }}>Suggestion: {t.tip}</X>
    </Card>
  );
}