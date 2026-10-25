// Results, laid out exactly like the design: the latest round as five rings, the daily trend, the recent-rounds table and the chosen
// round's chart with its insights. Staff see every player; a player sees their own rounds.

import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { GAMES } from '@nboard/shared';
import type { InsightsResult, Page, PerformanceResponse, SessionDTO } from '@nboard/shared';
import { C, INK } from '../../../theme/tokens';
import { useDevice } from '../../../theme/device';
import { useGet } from '../../../lib/queries';
import { useAuth } from '../../../state/auth';
import { fmtDay } from '../../../lib/format';
import type { HitRowDTO } from '../../../lib/roundStats';
import { WeekChart } from '../../../charts/RoundCharts';
import type { WeekSeries } from '../../../charts/RoundCharts';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Card } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { CardH, Empty, Facts, Seg, X } from '../../../ui/Bits';
import { RingGauge } from '../../../ui/RingGauge';
import { InsightsPanel } from '../../../ui/Insights';
import { LoadingBlock } from '../../../ui/States';

interface Overview { rounds: SessionDTO[]; daily: { day: string; avg_rt: number | null; best_rt: number | null; accuracy: number | null; misses: number | null }[] }

const shortName = (n: string) => { const p = n.trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
const r1 = (n: number) => Math.round(n * 10) / 10;

function Glow() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden' }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="rglow" cx="23%" cy="15%" rx="35%" ry="45%" fx="23%" fy="15%">
            <Stop offset="0" stopColor="rgb(53,199,255)" stopOpacity={0.17} />
            <Stop offset="1" stopColor="rgb(53,199,255)" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#rglow)" />
      </Svg>
    </View>
  );
}

function Row({ cells, widths, on, odd, onPress, head }: { cells: React.ReactNode[]; widths: number[]; on?: boolean; odd?: boolean; onPress?: () => void; head?: boolean }) {
  const { u } = useDevice();
  const inner = (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, paddingHorizontal: u * 0.75, paddingVertical: head ? u * 0.5 : u * 0.625, borderRadius: u }, on ? ({ backgroundColor: C.tintHi, boxShadow: 'inset 0 0 0 1px rgba(210,255,122,.3)' } as never) : odd ? { backgroundColor: C.tint } : null]}>
      {cells.map((c, i) => <View key={i} style={{ flex: widths[i], minWidth: 0 }}>{c}</View>)}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}>{inner}</Pressable> : inner;
}

export default function ResultsScreen() {
  const { u, tv, wide } = useDevice();
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const pl = user.role === 'PLAYER';
  const [range, setRange] = useState<7 | 14>(14);
  const [sel, setSel] = useState(0);

  const ov = useGet<Overview>(pl ? null : '/results/overview', { days: range, limit: 8 });
  const mine = useGet<Page<SessionDTO>>(pl ? '/me/results' : null, { limit: 8, status: 'played' });
  const myPerf = useGet<PerformanceResponse>(pl ? '/me/performance' : null);
  const rounds = (pl ? mine.data?.items : ov.data?.rounds) ?? [];
  const r = rounds[Math.min(sel, rounds.length - 1)];
  const hits = useGet<{ hits: HitRowDTO[] }>(r ? `/sessions/${r.id}/hits` : null);
  const ins = useGet<InsightsResult>(r ? `/sessions/${r.id}/insights` : null);
  const loading = pl ? mine.isLoading : ov.isLoading;
  const nameOf = (x: SessionDTO) => (pl ? user.display_name : x.player_name ?? '');

  const main = useMemo(() => {
    if (pl) {
      const t = (myPerf.data?.trend ?? []).slice(-14);
      return { labels: t.map((_, i) => 'R' + (i + 1)), rt: t.map((x) => x.avg_rt), fast: t.map((x) => x.best_rt), acc: t.map((x) => r1(x.accuracy)), miss: t.map((x) => x.misses) };
    }
    const d = ov.data?.daily ?? [];
    return { labels: d.map((x) => fmtDay(x.day + 'T12:00:00Z')), rt: d.map((x) => x.avg_rt), fast: d.map((x) => x.best_rt), acc: d.map((x) => x.accuracy), miss: d.map((x) => x.misses) };
  }, [pl, myPerf.data, ov.data]);
  const mser: WeekSeries[] = [
    { name: 'Avg reaction (ms)', data: main.rt, color: INK.line2, axis: 0 },
    { name: 'Fastest (ms)', data: main.fast, color: INK.line, axis: 0 },
    { name: 'Accuracy (%)', data: main.acc, color: '#FFBD59', axis: 1 },
    { name: 'Misses', data: main.miss, color: '#FF5263', axis: 2, dash: true },
  ];

  // The chosen round in six equal slices of its duration.
  const slices = useMemo(() => {
    const rows = hits.data?.hits ?? [];
    if (!r || !rows.length) return null;
    const dur = Math.max(1000, r.summary?.duration_ms ?? Math.max(...rows.map((x) => x.t_ms)));
    const b = Array.from({ length: 6 }, () => ({ rt: [] as number[], h: 0, m: 0 }));
    for (const x of rows) {
      const i = Math.min(5, Math.floor((x.t_ms / dur) * 6));
      if (x.correct) { b[i]!.h++; if (x.rt_ms !== null) b[i]!.rt.push(x.rt_ms); } else b[i]!.m++;
    }
    const st = dur / 6000;
    return {
      labels: b.map((_, i) => `${Math.round(i * st)}-${Math.round((i + 1) * st)}s`),
      series: [
        { name: 'Avg reaction (ms)', color: INK.line2, axis: 0, data: b.map((x) => (x.rt.length ? Math.round(x.rt.reduce((p, c) => p + c, 0) / x.rt.length) : null)) },
        { name: 'Accuracy (%)', color: '#FFBD59', axis: 1, data: b.map((x) => (x.h + x.m ? r1((x.h / (x.h + x.m)) * 100) : null)) },
        { name: 'Hits', color: INK.line, axis: 2, data: b.map((x) => x.h) },
        { name: 'Misses', color: '#FF5263', axis: 2, dash: true, data: b.map((x) => x.m) },
      ] as WeekSeries[],
    };
  }, [hits.data, r]);

  const phone = !wide;
  const cols = phone ? [1.3, 1.2, 0.7, 0.8] : [1.5, 1.2, 0.5, 0.6, 0.6, 0.8, 0.8];
  const sm = r?.summary;
  const accOf = (x: SessionDTO) => (x.summary ? r1(x.summary.accuracy) : 0);
  const txt = (s: string, c?: string, w: 'm' | 'b' = 'm') => <X s={0.88} w={w} c={c} num numberOfLines={1}>{s}</X>;

  return (
    <Screen testID="screen-results" maxWidth={100000}>
      <Header eyebrow={pl ? 'Your own results' : 'All players'} title="Results" right={pl ? undefined : <Seg<7 | 14> items={[[7, '7 days'], [14, '14 days']]} value={range} onChange={setRange} />} />
      <View style={{ height: u * 0.75 }} />
      {loading ? <LoadingBlock label="Loading results" /> : !r || !sm ? (
        <Empty>No rounds yet. Play a game and it shows up here.</Empty>
      ) : (
        <View style={{ gap: u }}>
          <Card pad={tv ? 1.5 : 1}>
            <Glow />
            <CardH em={`${shortName(nameOf(r))} · ${GAMES[r.game].name} L${r.level}`}>Latest round</CardH>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: u }}>
              {[
                [sm.accuracy, 1, 'Accuracy', '%', sm.accuracy / 100],
                [sm.avg_rt ?? 0, 0, 'Avg reaction', 'ms', (620 - (sm.avg_rt ?? 620)) / 320],
                [sm.best_rt ?? 0, 0, 'Fastest', 'ms', (620 - (sm.best_rt ?? 620)) / 320],
                [sm.correct_hits, 0, 'Hits', '', sm.correct_hits / Math.max(1, sm.events)],
                [sm.misses, 0, 'Misses', '', sm.misses / Math.max(1, sm.events)],
              ].map(([v, dec, l, un, f], i) => (
                <View key={String(l)} style={{ width: '20%', minWidth: 0 }}>
                  <RingGauge k={r.id} ci={i} v={v as number} dec={dec as number} unit={un as string} label={l as string} frac={f as number} />
                </View>
              ))}
            </View>
          </Card>

          <Card>
            <CardH em={pl ? 'oldest to newest' : 'daily average'}>{pl ? 'Your rounds' : 'All players'}</CardH>
            <WeekChart labels={main.labels} series={mser} height={u * (phone ? 14 : 15)} revealKey={`${pl}${range}${main.rt.join()}`} />
          </Card>

          <Card>
            <CardH>Recent rounds</CardH>
            <View style={{ gap: u * 0.25 }}>
              <Row head widths={cols} cells={(phone ? ['Player', 'Game', 'Misses', 'Acc'] : ['Player', 'Game', 'Lvl', 'Hits', 'Misses', 'Acc', 'Avg RT']).map((h) => <X key={h} s={0.78 * 0.88} w="b" c={C.faint}>{h}</X>)} />
              {rounds.slice(0, 6).map((x, i) => {
                const a = accOf(x);
                const cells = [
                  txt(shortName(nameOf(x))),
                  txt(phone ? GAMES[x.game].name.split(' ')[0] + ' L' + x.level : GAMES[x.game].name),
                  ...(phone ? [] : [txt(String(x.level)), txt(String(x.summary?.correct_hits ?? 0))]),
                  txt(String(x.summary?.misses ?? 0)),
                  txt(a + '%', a >= 93 ? INK.line : a < 90 ? C.warning : undefined),
                  ...(phone ? [] : [txt(`${x.summary?.avg_rt ?? '--'} ms`)]),
                ];
                return <Row key={x.id} widths={cols} cells={cells} on={i === sel} odd={i % 2 === 1} onPress={() => setSel(i)} />;
              })}
            </View>
          </Card>

          <View style={{ flexDirection: tv ? 'row' : 'column', gap: u, alignItems: 'stretch' }}>
            <Card style={{ flex: tv ? 1 : undefined, width: tv ? undefined : '100%' }}>
              <CardH>{shortName(nameOf(r))} · {GAMES[r.game].name} L{r.level}</CardH>
              {slices ? <WeekChart labels={slices.labels} series={slices.series} height={u * 12} revealKey={r.id} /> : <LoadingBlock label="Loading round" />}
              <View style={{ marginTop: u * 0.75 }}>
                <Facts items={[['Hits', sm.correct_hits], ['Misses', sm.misses], ['Accuracy', r1(sm.accuracy) + '%'], ['Avg RT', `${sm.avg_rt ?? '--'} ms`]]} />
              </View>
            </Card>
            <Card style={{ flex: tv ? 1 : undefined, width: tv ? undefined : '100%' }}>
              <CardH>Performance Insights &amp; Improvement Plan</CardH>
              {ins.data ? <InsightsPanel bare result={ins.data} /> : <LoadingBlock label="Loading insights" />}
            </Card>
          </View>
          <View style={{ alignItems: 'flex-start' }}>
            <Button size="sm" variant="secondary" label="Full history" onPress={() => router.push((pl ? '/results/history' : `/results/${r.id}`) as never)} />
          </View>
        </View>
      )}
    </Screen>
  );
}