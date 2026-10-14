// Organisation / roster performance for staff: 30-day figures, players who need attention and per-game accuracy.
// Coach, Admin and Super Admin figures all cover every player (the server decides, not this screen).

import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GAMES } from '@nboard/shared';
import type { OrgPerformanceResponse } from '@nboard/shared';
import { C, GAME_ACCENT } from '../theme/tokens';
import { useGet } from '../lib/queries';
import { Avatar } from './Avatar';
import { Badge } from './Chip';
import { Card } from './Card';
import { Icon } from './Icon';
import { InsightsPanel } from './Insights';
import { ProgressBar } from './Progress';
import { SectionTitle, Stat, StatRow } from './Stat';
import { ErrorBlock, LoadingBlock } from './States';
import { Txt } from './Txt';

export function useOrgPerformance() {
  return useGet<OrgPerformanceResponse>('/analytics/performance');
}

export function AttentionList({ data }: { data: OrgPerformanceResponse }) {
  const router = useRouter();
  return (
    <View style={{ gap: 10 }} testID="attention-list">
      <SectionTitle>Needs attention</SectionTitle>
      {data.attention.length === 0 ? (
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icon name="check" size={22} color={C.success} />
          <Txt v="body" style={{ flex: 1 }}>{data.players === 0 ? 'No players yet.' : 'Every active player has trained recently and is on track.'}</Txt>
        </Card>
      ) : (
        data.attention.slice(0, 6).map((a) => (
          <Card key={a.player_id} onPress={() => router.push(`/players/${a.player_id}` as never)} accessibilityLabel={`${a.name}: ${a.reasons.map((r) => r.text).join(' ')}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar name={a.name} size={40} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="bodyStrong" numberOfLines={1}>{a.name} <Txt v="mono" color={C.highlight} size={12}>{a.code}</Txt></Txt>
                {a.reasons.map((r) => <Txt key={r.code} v="small" color={C.sub}>{r.text}</Txt>)}
              </View>
              <Icon name="chevron" size={18} color={C.faint} />
            </View>
          </Card>
        ))
      )}
    </View>
  );
}

export function OrgPanels({ withInsights = true }: { withInsights?: boolean }) {
  const q = useOrgPerformance();
  if (q.isLoading) return <LoadingBlock label="Loading performance" />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  return (
    <View style={{ gap: 14 }} testID="org-panels">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <SectionTitle>Last 30 days</SectionTitle>
        <Badge label={d.scoped ? 'Selected players' : 'All players'} color={C.sub} icon="users" />
      </View>
      <StatRow>
        <Stat label="Active players" value={String(d.active_players_30d)} note={`of ${d.players}`} icon="users" />
        <Stat label="Rounds" value={String(d.rounds_30d)} icon="play" />
        <Stat label="Accuracy" value={d.accuracy_30d === null ? '--' : `${Math.round(d.accuracy_30d)}%`} icon="target" color={C.highlight} />
        <Stat label="Avg reaction" value={d.avg_rt_30d === null ? '--' : String(d.avg_rt_30d)} unit="ms" icon="bolt" />
      </StatRow>

      {d.by_game.length ? (
        <Card style={{ gap: 14 }}>
          <Txt v="h3">Accuracy by game</Txt>
          {d.by_game.map((g) => (
            <View key={g.game} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name={GAMES[g.game].icon} size={18} color={GAME_ACCENT[g.game]} />
                <Txt v="bodyStrong" style={{ flex: 1 }}>{GAMES[g.game].name}</Txt>
                <Txt v="small">{g.rounds} rounds</Txt>
                <Txt v="mono" color={C.text}>{g.accuracy === null ? '--' : `${g.accuracy}%`}</Txt>
              </View>
              <ProgressBar value={g.accuracy ?? 0} color={GAME_ACCENT[g.game]} height={10} label={`${GAMES[g.game].name}: ${g.accuracy ?? 0}% accuracy over ${g.rounds} rounds`} />
            </View>
          ))}
        </Card>
      ) : null}

      <AttentionList data={d} />
      {withInsights && d.insights.length ? <InsightsPanel result={{ items: d.insights, enough_data: true, sessions_considered: d.rounds_30d, note: 'Based on completed rounds in the last 30 days. Suggestions are for training planning, not a diagnosis.' }} /> : null}
    </View>
  );
}
