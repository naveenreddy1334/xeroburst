// S11 History, S12 Progress and S13 Analytics, as three tabs. Staff land on the activity feed instead.

import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { GAMES, GAME_SLUGS, PRIMARY_METRIC, fmtDuration, fmtMetric, fmtMs, fmtPct } from '@nboard/shared';
import type { AnalyticsRange, AnalyticsResponse, GameSlug, MyProgressResponse, PerformanceResponse, SessionDTO } from '@nboard/shared';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Txt } from '../../../ui/Txt';
import { Card } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Badge, Chip, Segmented } from '../../../ui/Chip';
import { Icon } from '../../../ui/Icon';
import { Stat, StatRow, SectionTitle } from '../../../ui/Stat';
import { StageTrack } from '../../../ui/Progress';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { BarChart, LineChart } from '../../../charts/Charts';
import { PerformanceProfile } from '../../../ui/Performance';
import { InsightsPanel } from '../../../ui/Insights';
import { C, GAME_ACCENT } from '../../../theme/tokens';
import { useAuth } from '../../../state/auth';
import { useGet, usePaged } from '../../../lib/queries';
import { fmtDateTime, fmtDay } from '../../../lib/format';

type Tab = 'history' | 'progress' | 'analytics' | 'performance';

export default function Results() {
  const role = useAuth((s) => s.user?.role);
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'performance' ? 'performance' : 'history');
  // Staff results are the roster view (performance across their players), not a personal history.
  if (role && role !== 'PLAYER') return <Redirect href={'/overview' as never} />;
  return (
    <Screen testID="screen-results">
      <Header title="My results" />
      <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: 'history', label: 'History' }, { value: 'progress', label: 'Progress' }, { value: 'analytics', label: 'Analytics' }, { value: 'performance', label: 'Insights' }]} />
      {tab === 'history' ? <History /> : tab === 'progress' ? <Progress /> : tab === 'analytics' ? <Analytics /> : <PerformanceTab />}
    </Screen>
  );
}

function PerformanceTab() {
  const q = useGet<PerformanceResponse>('/me/performance');
  if (q.isLoading) return <LoadingBlock />;
  if (q.error || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <PerformanceProfile perf={q.data} />
      <InsightsPanel result={q.data.insights} empty="Play a few rounds and your improvement plan appears here." />
    </>
  );
}

function GameFilter({ value, onChange }: { value: GameSlug | null; onChange: (g: GameSlug | null) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label="All games" selected={value === null} onPress={() => onChange(null)} />
      {GAME_SLUGS.map((g) => <Chip key={g} label={GAMES[g].name} icon={GAMES[g].icon} selected={value === g} color={GAME_ACCENT[g]} onPress={() => onChange(g)} />)}
    </View>
  );
}

function History() {
  const router = useRouter();
  const [game, setGame] = useState<GameSlug | null>(null);
  const [onlyDone, setOnlyDone] = useState(true);
  const q = usePaged<SessionDTO>('/me/results', { game: game ?? undefined, status: onlyDone ? 'completed' : 'any', limit: 20 });
  return (
    <>
      <GameFilter value={game} onChange={setGame} />
      <Chip label="Completed rounds only" selected={onlyDone} onPress={() => setOnlyDone(!onlyDone)} icon="check" />
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : q.items.length === 0 ? <EmptyBlock icon="list" title="No rounds yet" message="Play a game and it shows up here." /> : (
        <View style={{ gap: 10 }}>
          {q.items.map((s) => {
            const m = PRIMARY_METRIC[s.game];
            const v = s.summary ? (s.summary.game === 'memory' ? s.summary.longest_seq : s.summary.game === 'endure' ? s.summary.degradation_pct : s.summary.avg_rt) : null;
            return (
              <Card key={s.id} onPress={() => router.push(`/results/${s.id}` as never)} accent={GAME_ACCENT[s.game]} testID={`result-${s.id}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name={GAMES[s.game].icon} color={GAME_ACCENT[s.game]} size={26} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{GAMES[s.game].name} · L{s.level}</Txt>
                    <Txt v="small">{fmtDateTime(s.ended_at ?? s.started_at)}</Txt>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Txt v="num" size={20}>{fmtMetric(s.game, v)}</Txt>
                    <Txt v="small">{m.label}</Txt>
                    {s.is_pb ? <Badge label="PB" color={C.warning} icon="trophy" /> : null}
                    {s.status !== 'completed' ? <Badge label={s.status === 'interrupted' ? 'Stopped' : 'Aborted'} color={C.warning} /> : null}
                  </View>
                </View>
              </Card>
            );
          })}
          {q.hasNextPage ? <Button label="Load more" variant="secondary" loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
        </View>
      )}
    </>
  );
}

function Progress() {
  const q = useGet<MyProgressResponse>('/me/progress');
  if (q.isLoading) return <LoadingBlock />;
  if (q.error) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data!;
  return (
    <>
      <StatRow>
        <Stat label="Day streak" value={String(p.streak.current)} icon="trophy" color={p.streak.current ? C.warning : C.text} note="Days in a row with a completed round" />
        <Stat label="Longest streak" value={String(p.streak.longest)} />
      </StatRow>
      {p.program ? (
        <Card>
          <Txt v="label">Program</Txt>
          <Txt v="h2">{p.program.program.name}</Txt>
          <Txt v="small" style={{ marginBottom: 10 }}>Stage {p.program.current_stage} of {p.program.stage_count}. Your coach moves you to the next stage.</Txt>
          <StageTrack stages={p.program.program.stages.map((s) => ({ label: s.label }))} current={p.program.current_stage} />
        </Card>
      ) : null}
      <SectionTitle>Personal bests</SectionTitle>
      {p.bests.length === 0 ? <EmptyBlock icon="trophy" title="No personal bests yet" message="Finish a round to set your first." /> : (
        <View style={{ gap: 8 }}>
          {p.bests.map((b) => (
            <Card key={`${b.game}${b.level}`}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={GAMES[b.game].icon} color={GAME_ACCENT[b.game]} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{GAMES[b.game].name} · Level {b.level}</Txt>
                  <Txt v="small">{PRIMARY_METRIC[b.game].label} · {fmtDay(b.achieved_at)}</Txt>
                </View>
                <Txt v="num" size={22} color={C.warning}>{fmtMetric(b.game, b.value)}</Txt>
              </View>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

function Analytics() {
  const [range, setRange] = useState<AnalyticsRange>('week');
  const [offset, setOffset] = useState(0);
  const [game, setGame] = useState<GameSlug | null>(null);
  const q = useGet<AnalyticsResponse>('/me/analytics', { range, offset, game: game ?? undefined });
  const a = q.data;
  const rtSeries = a?.series.map((s) => s.avg_rt) ?? [];
  return (
    <>
      <Segmented<AnalyticsRange> value={range} onChange={(r) => { setRange(r); setOffset(0); }} options={[{ value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Earlier" variant="ghost" icon="back" size="sm" onPress={() => setOffset(offset - 1)} />
        <Txt v="h3" align="center" style={{ flex: 1 }}>{a?.label ?? ' '}</Txt>
        <Button label="Later" variant="ghost" iconRight="chevron" size="sm" disabled={offset >= 0} onPress={() => setOffset(Math.min(0, offset + 1))} />
      </View>
      <GameFilter value={game} onChange={setGame} />
      {q.isLoading ? <LoadingBlock /> : q.error ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : a ? (
        a.totals.sessions === 0 ? <EmptyBlock icon="chart" title="Nothing in this period" message="Completed rounds in this period appear here." /> : (
          <>
            <StatRow>
              <Stat label="Rounds" value={String(a.totals.sessions)} note={`${a.previous.sessions} before`} />
              <Stat label="Hits" value={String(a.totals.hits)} color={C.success} />
              <Stat label="Misses" value={String(a.totals.misses)} color={a.totals.misses ? C.danger : C.text} note={`${a.previous.misses} before`} />
              <Stat label="Average" value={a.totals.avg_rt ? String(Math.round(a.totals.avg_rt)) : '--'} unit="ms" note={a.previous.avg_rt ? `${fmtMs(a.previous.avg_rt)} before` : undefined} />
              <Stat label="Time trained" value={fmtDuration(a.totals.time_trained_ms)} />
              <Stat label="Accuracy" value={fmtPct(a.totals.accuracy, 0)} />
            </StatRow>
            <Card>
              <Txt v="h3">Rounds</Txt>
              <BarChart data={a.series.map((s) => ({ label: s.label, value: s.sessions }))} accessibilityLabel="Rounds in each part of the period" />
            </Card>
            {rtSeries.filter((x) => x !== null).length > 1 ? (
              <Card>
                <Txt v="h3">Average reaction time</Txt>
                <LineChart data={rtSeries} labels={a.series.map((s) => s.label)} format={(n) => `${Math.round(n)} ms`} dots reference={a.previous.avg_rt} accessibilityLabel="Average reaction time over the period" />
                <Txt v="small">Lower is faster.</Txt>
              </Card>
            ) : null}
            <SectionTitle>By game</SectionTitle>
            {a.per_game.map((g) => (
              <Card key={g.game} accent={GAME_ACCENT[g.game]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Icon name={GAMES[g.game].icon} color={GAME_ACCENT[g.game]} />
                  <View style={{ flex: 1 }}>
                    <Txt v="bodyStrong">{GAMES[g.game].name}</Txt>
                    <Txt v="small">{g.sessions} rounds · best {fmtMetric(g.game, g.best_value)}</Txt>
                  </View>
                  {g.improvement_pct !== null ? (
                    <Badge label={`${g.improvement_pct <= 0 ? '' : '+'}${g.improvement_pct.toFixed(1)}%`} color={g.improvement_pct <= 0 ? C.success : C.danger} icon={g.improvement_pct <= 0 ? 'trendUp' : 'trendDown'} />
                  ) : null}
                </View>
                {g.fatigue_pct !== null ? <Txt v="small" style={{ marginTop: 6 }}>Slows by {g.fatigue_pct.toFixed(1)}% by the end of a round.</Txt> : null}
              </Card>
            ))}
          </>
        )
      ) : null}
    </>
  );
}
