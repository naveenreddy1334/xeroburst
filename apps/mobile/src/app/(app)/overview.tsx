// S04 Dashboard. Players: welcome, tags, this week, program, games. Staff: overview and recent activity.

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GAMES, GAME_SLUGS, ROLE_LABEL, fmtDuration, fmtMs } from '@nboard/shared';
import type { ActivityItem, AnalyticsResponse, GameDTO, MyProgressResponse, OverviewResponse } from '@nboard/shared';
import { Screen } from '../../ui/Screen';
import { Txt } from '../../ui/Txt';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Chip';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Ring, Sparkline } from '../../charts/Charts';
import { Stat, StatRow, SectionTitle } from '../../ui/Stat';
import { ErrorBlock, LoadingBlock, Banner } from '../../ui/States';
import { ProgressBar } from '../../ui/Progress';
import { C, GAME_ACCENT } from '../../theme/tokens';
import { useDevice } from '../../theme/device';
import { useAuth, useCan } from '../../state/auth';
import { useGet } from '../../lib/queries';
import { useOutbox } from '../../lib/outbox';
import { OrgPanels } from '../../ui/OrgPanels';
import { InsightsPanel } from '../../ui/Insights';
import { BarChart } from '../../charts/Charts';
import type { PerformanceResponse, PlayerListItem, Page } from '@nboard/shared';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Chip } from '../../ui/Chip';

function firstName(n: string) {
  const t = n.trim().replace(/^(coach|admin|dr|mr|ms|mrs)\.?\s+/i, '');
  return t.split(/\s+/)[0] || n;
}

function Hello() {
  const user = useAuth((s) => s.user)!;
  const player = useAuth((s) => s.player);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return (
    <View style={{ gap: 8 }}>
      <Txt v="label">{greet}</Txt>
      <Txt v="display" testID="welcome-name">Welcome, {firstName(user.display_name)}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Badge label={ROLE_LABEL[user.role]} color={C.highlight} icon="user" />
        {player ? <Badge label={player.player_code.toUpperCase()} color={C.secondary} icon="key" /> : null}
        {player?.coach ? <Badge label={`Coach: ${player.coach.name.replace(/^coach\s+/i, '')}`} color={C.sub} icon="users" /> : null}
      </View>
    </View>
  );
}

function PendingBanner() {
  const n = useOutbox((s) => s.count);
  if (!n) return null;
  return <Banner icon="refresh" color={C.warning}>{`${n} round${n > 1 ? 's' : ''} saved on this device. They upload when the server is reachable.`}</Banner>;
}

function GameTile({ g }: { g: GameDTO }) {
  const router = useRouter();
  const info = GAMES[g.slug];
  const locked = g.state === 'locked';
  const accent = locked ? C.locked : GAME_ACCENT[g.slug];
  return (
    <Card accent={accent} onPress={() => router.push(`/nboard/${g.slug}/howto` as never)} accessibilityLabel={`${info.name}${locked ? ', locked' : ''}`} style={{ flexGrow: 1, flexBasis: 230, opacity: locked ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Icon name={locked ? 'lock' : info.icon} size={30} color={locked ? C.lockedText : accent} />
        <View style={{ flex: 1 }}>
          <Txt v="h3" color={locked ? C.lockedText : C.text}>{info.name}</Txt>
          <Txt v="small">{locked ? 'Locked. Tap to read how it works.' : g.state === 'completed' ? 'Target reached' : `${g.sessions_count} rounds · up to level ${g.level_cap}`}</Txt>
        </View>
        {g.state === 'completed' ? <Icon name="check" color={C.success} /> : null}
      </View>
    </Card>
  );
}

/** The player's own improvement plan, top two recommendations. The full profile is under Results. */
function MyPlan() {
  const router = useRouter();
  const q = useGet<PerformanceResponse>('/me/performance');
  if (q.isLoading || !q.data) return null;
  const ins = q.data.insights;
  return (
    <View style={{ gap: 10 }}>
      <InsightsPanel result={{ ...ins, items: ins.items.slice(0, 2) }} empty="Play your first round and your plan appears here." />
      {q.data.summary.sessions > 0 ? <Button label="Full performance profile" icon="chart" variant="secondary" onPress={() => router.push('/results/history?tab=performance' as never)} /> : null}
    </View>
  );
}

function PlayerHome() {
  const { cols } = useDevice();
  const router = useRouter();
  const week = useGet<AnalyticsResponse>('/me/analytics', { range: 'week' });
  const prog = useGet<MyProgressResponse>('/me/progress');
  if (prog.isLoading || week.isLoading) return <LoadingBlock />;
  if (prog.error) return <ErrorBlock error={prog.error} onRetry={() => void prog.refetch()} />;
  const p = prog.data!;
  const w = week.data;
  const open = p.games.filter((g) => g.state !== 'locked');
  const next = [...open].sort((a, b) => (a.last_played_at ?? '').localeCompare(b.last_played_at ?? ''))[0];
  const sessionsSpark = w?.series.map((s) => s.sessions) ?? [];
  return (
    <>
      <PendingBanner />
      {next ? (
        <Button label={`Play ${GAMES[next.slug].name}`} icon="play" size="lg" full preferredFocus color={GAME_ACCENT[next.slug]} variant="accent" onPress={() => router.push(`/nboard/${next.slug}/howto` as never)} testID="play-next" />
      ) : (
        <Banner icon="lock" color={C.sub}>No games are unlocked yet. Your coach will unlock them.</Banner>
      )}

      <StatRow>
        <Stat label="Rounds this week" value={String(w?.totals.sessions ?? 0)} icon="play" note={w ? `${w.previous.sessions} last week` : undefined} />
        <Stat label="Average speed" value={w?.totals.avg_rt ? String(Math.round(w.totals.avg_rt)) : '--'} unit="ms" icon="bolt" note={w?.previous.avg_rt ? `${fmtMs(w.previous.avg_rt)} last week` : undefined} />
        <Stat label="Day streak" value={String(p.streak.current)} icon="trophy" note={`Longest ${p.streak.longest}`} color={p.streak.current > 0 ? C.warning : C.text} />
        <Stat label="Time trained" value={fmtDuration(w?.totals.time_trained_ms ?? 0)} icon="clock" />
      </StatRow>
      {sessionsSpark.length > 1 ? (
        <Card>
          <Txt v="label">Rounds each day</Txt>
          <Sparkline data={sessionsSpark} width={280} height={36} />
        </Card>
      ) : null}

      {p.program ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <Ring value={p.program.progress_pct} size={100} color={C.highlight}>
              <Txt v="num" size={16}>{`${Math.round(p.program.progress_pct)}%`}</Txt>
            </Ring>
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="label">Your program</Txt>
              <Txt v="h3">{p.program.program.name}</Txt>
              <Txt v="small">Stage {p.program.current_stage} of {p.program.stage_count}</Txt>
              <ProgressBar value={p.program.progress_pct} />
            </View>
          </View>
        </Card>
      ) : null}

      <MyPlan />

      <SectionTitle right={<Button label="All games" variant="ghost" size="sm" iconRight="chevron" onPress={() => router.push('/nboard' as never)} />}>Your games</SectionTitle>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {GAME_SLUGS.map((s) => {
          const g = p.games.find((x) => x.slug === s);
          return g ? <GameTile key={s} g={g} /> : null;
        })}
      </View>
      <Button label="See my results" icon="chart" variant="secondary" onPress={() => router.push('/results/history' as never)} />
      <View style={{ height: cols }} />
    </>
  );
}

function StaffHome() {
  const router = useRouter();
  const role = useAuth((s) => s.user?.role);
  const can = useCan();
  const ov = useGet<OverviewResponse>('/analytics/overview', undefined, { enabled: can('VIEW_RESULTS') });
  const act = useGet<{ items: ActivityItem[] }>('/activity', { limit: 5 }, { enabled: can('VIEW_RESULTS') });
  const delta = (a: number, b: number) => (b === 0 ? (a > 0 ? 'new' : '') : `${a >= b ? '+' : ''}${Math.round(((a - b) / b) * 100)}% vs last week`);
  const isSuper = role === 'SUPER_ADMIN';
  return (
    <>
      {/* Primary action first, the rest are secondary. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {can('MANAGE_PLAYERS') ? <Button label="New player" icon="plus" onPress={() => router.push('/players/new' as never)} testID="home-new-player" /> : null}
        {can('MANAGE_PLAYERS') ? <Button label={'All players'} icon="users" variant="secondary" onPress={() => router.push('/players' as never)} /> : null}
        {can('PLAY_GAME') ? <Button label="Play a game" icon="play" variant="secondary" onPress={() => router.push('/nboard' as never)} /> : null}
        {can('VIEW_RESULTS') ? <Button label="Activity" icon="list" variant="secondary" onPress={() => router.push('/activity' as never)} /> : null}
      </View>
      {isSuper ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }} testID="home-admin-actions">
          {can('MANAGE_COACHES') ? <Button label="Coaches" icon="user" variant="ghost" onPress={() => router.push('/coaches' as never)} /> : null}
          {can('MANAGE_ADMINS') ? <Button label="Admins" icon="shield" variant="ghost" onPress={() => router.push('/admins' as never)} /> : null}
          {can('MANAGE_SYSTEM') ? <Button label="System" icon="server" variant="ghost" onPress={() => router.push('/system' as never)} /> : null}
          {can('VIEW_AUDIT') ? <Button label="Audit log" icon="doc" variant="ghost" onPress={() => router.push('/audit' as never)} /> : null}
        </View>
      ) : null}
      {ov.isLoading ? <LoadingBlock /> : ov.error ? <ErrorBlock error={ov.error} onRetry={() => void ov.refetch()} /> : ov.data ? (
        <>
          <StatRow>
            <Stat label="Players" value={String(ov.data.total_players)} icon="users" />
            <Stat label="Active this week" value={String(ov.data.active_players_week)} icon="bolt" />
            <Stat label="Rounds this week" value={String(ov.data.sessions_week)} icon="play" note={delta(ov.data.sessions_week, ov.data.sessions_prev_week)} />
            <Stat label="Average speed" value={ov.data.avg_rt_week ? String(Math.round(ov.data.avg_rt_week)) : '--'} unit="ms" icon="clock" />
          </StatRow>
          <Card style={{ gap: 8 }}>
            <Txt v="h3">Rounds this week</Txt>
            <BarChart data={ov.data.series.map((s) => ({ label: s.label, value: s.sessions }))} accessibilityLabel="Rounds per day this week" />
          </Card>
        </>
      ) : null}
      {can('VIEW_RESULTS') ? <OrgPanels withInsights={false} /> : null}
      {act.data?.items.length ? (
        <>
          <SectionTitle right={<Button label="All activity" variant="ghost" size="sm" iconRight="chevron" onPress={() => router.push('/activity' as never)} />}>Recent sessions</SectionTitle>
          {act.data.items.map((a) => (
            <Card key={a.id} onPress={() => router.push(`/results/${a.id}` as never)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Icon name={GAMES[a.game].icon} color={GAME_ACCENT[a.game]} />
                <View style={{ flex: 1 }}>
                  <Txt v="bodyStrong">{a.player_name}</Txt>
                  <Txt v="small">{GAMES[a.game].name} · level {a.level}</Txt>
                </View>
                {a.is_pb ? <Badge label="PB" color={C.warning} icon="trophy" /> : null}
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </>
  );
}

export default function Overview() {
  const role = useAuth((s) => s.user?.role);
  return (
    <Screen testID="screen-dashboard">
      {role === 'PLAYER' ? <Hello /> : null}
      {role === 'PLAYER' ? <PlayerHome /> : <StaffHome />}
    </Screen>
  );
}
