// A player's performance profile: key metrics, accuracy and speed trends, a last-five-rounds comparison and
// level-wise results. All figures come from the server's PerformanceResponse, which is built from the same
// stored summaries as the statistics and reports. Nothing is estimated here.

import { useState } from 'react';
import { View } from 'react-native';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { GameSlug, PerformanceResponse } from '@nboard/shared';
import { C, GAME_ACCENT, alpha } from '../theme/tokens';
import { LineChart } from '../charts/Charts';
import { fmtDay } from '../lib/format';
import { Badge, Chip } from './Chip';
import { Card } from './Card';
import { Icon } from './Icon';
import { Stat, StatRow, SectionTitle } from './Stat';
import { Txt } from './Txt';
import { EmptyBlock } from './States';

type Dir = 'better' | 'worse' | 'same';

function Delta({ label, now, before, unit, lowerIsBetter, decimals = 0 }: { label: string; now: number | null; before: number | null; unit: string; lowerIsBetter?: boolean; decimals?: number }) {
  const f = (n: number | null) => (n === null ? '--' : decimals ? n.toFixed(decimals) : String(Math.round(n)));
  let dir: Dir = 'same';
  let text = 'No change';
  if (now !== null && before !== null) {
    const d = Math.round((now - before) * 10 ** decimals) / 10 ** decimals;
    if (d !== 0) {
      const good = lowerIsBetter ? d < 0 : d > 0;
      dir = good ? 'better' : 'worse';
      text = `${d > 0 ? '+' : ''}${decimals ? d.toFixed(decimals) : d} ${unit} · ${good ? 'improving' : 'declining'}`;
    }
  } else text = 'Not enough data';
  const color = dir === 'better' ? C.success : dir === 'worse' ? C.danger : C.sub;
  return (
    <View style={{ flexGrow: 1, flexBasis: 180, gap: 4 }}>
      <Txt v="label" size={12}>{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Txt v="num" size={26}>{f(now)}</Txt>
        <Txt v="small">{unit} now</Txt>
        <Txt v="small" color={C.faint}>was {f(before)}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {dir !== 'same' ? <Icon name={dir === 'better' ? 'trendUp' : 'trendDown'} size={15} color={color} /> : null}
        <Txt v="small" color={color}>{text}</Txt>
      </View>
    </View>
  );
}

export function ComparisonCard({ perf }: { perf: PerformanceResponse }) {
  const s = perf.summary;
  return perf.comparison ? (
        <Card style={{ gap: 12 }} testID="comparison">
          <Txt v="h3">Last {perf.comparison.recent.rounds} rounds vs the {perf.comparison.previous.rounds} before</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
            <Delta label="Accuracy" now={perf.comparison.recent.accuracy} before={perf.comparison.previous.accuracy} unit="%" decimals={1} />
            <Delta label="Reaction time" now={perf.comparison.recent.avg_rt} before={perf.comparison.previous.avg_rt} unit="ms" lowerIsBetter />
          </View>
          <Txt v="small" color={C.faint}>Reaction time mixes games here; choose a game above to compare like with like.</Txt>
        </Card>
  ) : (
        <Card><Txt v="small" color={C.sub}>A last-five-rounds comparison appears after six completed rounds ({s.sessions} so far).</Txt></Card>
  );
}

export function LevelTable({ perf, game }: { perf: PerformanceResponse; game: GameSlug | null }) {
  const levels = perf.levels.filter((l) => !game || l.game === game);
  return (
    <View style={{ gap: 10 }}>
      <SectionTitle>Level-wise performance</SectionTitle>
      <Card padded={false} testID="level-table">
        <View style={{ flexDirection: 'row', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
          {['Game · level', 'Rounds', 'Accuracy', 'Avg RT'].map((h, i) => (
            <Txt key={h} v="label" size={11} style={{ flex: i === 0 ? 2.2 : 1, textAlign: i === 0 ? 'left' : 'right' }}>{h}</Txt>
          ))}
        </View>
        {levels.length === 0 ? (
          <View style={{ padding: 14 }}><Txt v="small" color={C.sub}>No rounds for this game yet.</Txt></View>
        ) : levels.map((l, idx) => (
          <View key={`${l.game}-${l.level}`} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: idx ? 1 : 0, borderTopColor: C.border, backgroundColor: l.weak ? alpha(C.primary, 0.07) : undefined }}>
            <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icon name={GAMES[l.game].icon} size={16} color={GAME_ACCENT[l.game]} />
              <Txt v="bodyStrong">{GAMES[l.game].name} · L{l.level}</Txt>
              {l.weak ? <Badge label="Weaker" color={C.highlight} icon="trendDown" /> : null}
            </View>
            <Txt v="mono" style={{ flex: 1, textAlign: 'right' }}>{l.sessions}</Txt>
            <Txt v="mono" color={l.weak ? C.danger : C.text} style={{ flex: 1, textAlign: 'right' }}>{l.accuracy === null ? '--' : `${l.accuracy}%`}</Txt>
            <Txt v="mono" style={{ flex: 1, textAlign: 'right' }}>{l.avg_rt === null ? '--' : `${Math.round(l.avg_rt)}`}</Txt>
          </View>
        ))}
      </Card>
      <Txt v="small" color={C.faint}>A level is marked weaker when its accuracy is 10 points or more below the player&apos;s accuracy at easier levels.</Txt>
    </View>
  );
}

export function PerformanceProfile({ perf, accent = C.primary }: { perf: PerformanceResponse; accent?: string }) {
  const [game, setGame] = useState<GameSlug | null>(null);
  const s = perf.summary;
  if (s.sessions === 0) {
    return <EmptyBlock icon="chart" title="No completed rounds yet" message="Performance appears here after the first completed round." />;
  }
  const played = GAME_SLUGS.filter((g) => perf.trend.some((p) => p.game === g) || perf.levels.some((l) => l.game === g));
  const pts = perf.trend.filter((p) => !game || p.game === game).slice(-24);
  const labels = pts.map((p) => fmtDay(p.started_at));
  const t = s.accuracy_trend;
  const trendNote = t ? `${t.direction === 'up' ? '▲' : t.direction === 'down' ? '▼' : '►'} ${t.delta > 0 ? '+' : ''}${t.delta} pts vs the 3 rounds before` : 'Trend after 4 rounds';
  const trendColor = !t || t.direction === 'flat' ? C.sub : t.direction === 'up' ? C.success : C.danger;
  const rtPts = pts.filter((p) => game !== null && p.avg_rt !== null);

  return (
    <View style={{ gap: 14 }} testID="performance-profile">
      <StatRow>
        <Stat label="Completed rounds" value={String(s.sessions)} icon="play" />
        <Stat label="Accuracy" value={s.accuracy === null ? '--' : `${Math.round(s.accuracy)}%`} icon="target" color={accent} note={trendNote} noteColor={trendColor} />
        <Stat label="Hits" value={String(s.hits)} icon="check" color={C.success} />
        <Stat label="Misses" value={String(s.misses)} color={s.misses ? C.danger : C.text} />
        <Stat label="Avg reaction" value={s.avg_rt === null ? '--' : String(s.avg_rt)} unit="ms" icon="bolt" />
      </StatRow>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Chip label="All games" selected={game === null} onPress={() => setGame(null)} />
        {played.map((g) => <Chip key={g} label={GAMES[g].name} icon={GAMES[g].icon} color={GAME_ACCENT[g]} selected={game === g} onPress={() => setGame(game === g ? null : g)} />)}
      </View>

      <ComparisonCard perf={perf} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Card style={{ flexGrow: 1, flexBasis: 320, gap: 8 }}>
          <Txt v="h3">Accuracy per round</Txt>
          {pts.length > 1 ? (
            <LineChart data={pts.map((p) => p.accuracy)} labels={labels.length <= 8 ? labels : undefined} color={accent} format={(n) => `${Math.round(n)}%`} endLabels yMin={0} accessibilityLabel="Accuracy of each recent round, oldest first" />
          ) : (
            <Txt v="small" color={C.sub}>A trend needs at least two rounds{game ? ` of ${GAMES[game].name}` : ''}.</Txt>
          )}
          <Txt v="small" color={C.faint}>Percent of events that were correct hits. Oldest on the left.</Txt>
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 320, gap: 8 }}>
          <Txt v="h3">Reaction time per round</Txt>
          {game === null ? (
            <Txt v="small" color={C.sub}>Choose a game above. Reaction times are only comparable within one game.</Txt>
          ) : rtPts.length > 1 ? (
            <LineChart data={rtPts.map((p) => p.avg_rt)} labels={rtPts.length <= 8 ? rtPts.map((p) => fmtDay(p.started_at)) : undefined} color={GAME_ACCENT[game]} format={(n) => `${Math.round(n)} ms`} endLabels accessibilityLabel="Average reaction time of each recent round, oldest first" />
          ) : (
            <Txt v="small" color={C.sub}>A trend needs at least two rounds of {GAMES[game].name}.</Txt>
          )}
          <Txt v="small" color={C.faint}>Average per round in milliseconds. Lower is faster.</Txt>
        </Card>
      </View>

      <LevelTable perf={perf} game={game} />
    </View>
  );
}

