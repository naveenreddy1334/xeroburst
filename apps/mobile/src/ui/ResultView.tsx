// The result of one round (S10), also used for history detail. Honest numbers: every figure comes from the
// server's summary, and "better" is judged per game (lower RT, longer sequence, less slow-down).

import { View } from 'react-native';
import { GAMES, PRIMARY_METRIC, fmtDuration, fmtMetric, fmtMs, fmtPct, fmtSigned } from '@nboard/shared';
import type { FinishResponse, SessionDTO } from '@nboard/shared';
import { C, GAME_ACCENT, R, alpha } from '../theme/tokens';
import { Txt } from './Txt';
import { Badge } from './Chip';
import { Icon } from './Icon';
import { Stat, StatRow } from './Stat';
import { Card } from './Card';
import { FatigueCurve, LineChart } from '../charts/Charts';
import { useCountUp } from './motion';
import { SessionInsights } from './Insights';

type Props = Partial<Pick<FinishResponse, 'previous' | 'delta' | 'is_pb' | 'state_change'>> & { session: SessionDTO; insights?: boolean };

export function ResultView({ session, previous, delta, is_pb, state_change, insights = true }: Props) {
  const s = session.summary;
  const info = GAMES[session.game];
  const metric = PRIMARY_METRIC[session.game];
  const accent = GAME_ACCENT[session.game];
  const partial = session.status !== 'completed';
  const heroVal = delta?.value ?? (s ? (session.game === 'memory' && s.game === 'memory' ? s.longest_seq : session.game === 'endure' && s.game === 'endure' ? s.degradation_pct : s.avg_rt) : null);
  const animated = useCountUp(heroVal !== null && metric.key !== 'degradation_pct' ? heroVal : null, 700, 0);
  const heroText = metric.key === 'degradation_pct' ? fmtMetric(session.game, heroVal) : heroVal === null ? '--' : animated;

  const changeColor = delta?.better === true ? C.success : delta?.better === false ? C.danger : C.sub;
  const changeText =
    delta && delta.change !== null
      ? `${fmtSigned(delta.change, delta.unit, metric.key === 'degradation_pct' ? 1 : 0)} vs last time`
      : previous || !delta
        ? null
        : 'First round at this level';

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Badge label={`${info.name} · Level ${session.level}`} color={accent} icon={info.icon} />
        {is_pb || session.is_pb ? <Badge label="Personal best" color={C.warning} icon="trophy" filled /> : null}
        {partial ? <Badge label={session.status === 'interrupted' ? 'Stopped early' : 'Aborted'} color={C.warning} icon="alert" /> : null}
        {state_change === 'completed' ? <Badge label="Target reached" color={C.success} icon="check" filled /> : null}
      </View>

      <View style={{ backgroundColor: alpha(accent, 0.1), borderWidth: 1.5, borderColor: alpha(accent, 0.45), borderRadius: R.xl, padding: 20, gap: 4 }} accessible accessibilityLabel={`${metric.label}: ${fmtMetric(session.game, heroVal)}. ${changeText ?? ''}`}>
        <Txt v="label">{metric.label}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Txt v="display" size={64} color={accent} style={{ lineHeight: 68 }}>{heroText}</Txt>
          {metric.unit && metric.key !== 'degradation_pct' ? <Txt v="h2" color={C.sub}>{metric.unit}</Txt> : null}
        </View>
        {changeText ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {delta?.better !== null && delta?.better !== undefined ? <Icon name={delta.better ? 'trendUp' : 'trendDown'} size={18} color={changeColor} /> : null}
            <Txt v="bodyStrong" color={changeColor}>{changeText}</Txt>
          </View>
        ) : null}
        {state_change === 'completed' ? <Txt v="small" color={C.success}>You met this game's target. Your coach decides what comes next.</Txt> : null}
      </View>

      {s ? (
        <>
          <StatRow>
            <Stat label="Hits" value={String(s.correct_hits)} icon="check" color={C.success} />
            <Stat label="Accuracy" value={fmtPct(s.accuracy, 0)} />
            <Stat label="Misses" value={String(s.misses)} color={s.misses ? C.danger : C.text} note={s.misses ? `${s.timeouts ?? 0} timed out · ${s.wrong_hits + s.distractor_hits} wrong presses` : undefined} />
            <Stat label="Time" value={fmtDuration(s.duration_ms)} icon="clock" />
          </StatRow>
          {s.game !== 'memory' ? (
            <StatRow>
              <Stat label="Average" value={s.avg_rt === null ? '--' : String(Math.round(s.avg_rt))} unit="ms" />
              <Stat label="Fastest" value={s.best_rt === null ? '--' : String(Math.round(s.best_rt))} unit="ms" />
              <Stat label="Steadiness" value={s.sd_rt === null ? '--' : `±${Math.round(s.sd_rt)}`} unit="ms" note="Lower is steadier" />
            </StatRow>
          ) : (
            <StatRow>
              <Stat label="Longest sequence" value={String(s.longest_seq)} />
              <Stat label="Mistakes" value={String(s.errors)} />
              <Stat label="Average" value={s.avg_rt === null ? '--' : String(Math.round(s.avg_rt))} unit="ms" />
            </StatRow>
          )}
          {s.game === 'hunt' ? (
            <StatRow>
              <Stat label="Wrong buttons" value={String(s.wrong_hits)} />
              <Stat label="Decoy presses" value={String(s.distractor_hits)} note="Pressed a light you should ignore" />
            </StatRow>
          ) : null}
          {s.game === 'endure' ? (
            <Card>
              <Txt v="h3">Fatigue</Txt>
              <View style={{ flexDirection: 'row', gap: 16, marginVertical: 8 }}>
                <View><Txt v="label">Start</Txt><Txt v="num" size={22}>{fmtMs(s.start_rt)}</Txt></View>
                <View><Txt v="label">Middle</Txt><Txt v="num" size={22}>{fmtMs(s.mid_rt)}</Txt></View>
                <View><Txt v="label">End</Txt><Txt v="num" size={22}>{fmtMs(s.end_rt)}</Txt></View>
              </View>
              {s.curve.length > 1 ? <FatigueCurve curve={s.curve} /> : null}
            </Card>
          ) : null}
          {s.game === 'quick' && s.trend.length > 2 ? (
            <Card>
              <Txt v="h3">Speed through the round</Txt>
              <LineChart data={s.trend} color={accent} format={(n) => `${Math.round(n)} ms`} endLabels yMin={0} accessibilityLabel="Reaction time of each hit in order" />
            </Card>
          ) : null}
          {s.game === 'hunt' && s.find_times.length > 2 ? (
            <Card>
              <Txt v="h3">Find time per target</Txt>
              <LineChart data={s.find_times} color={accent} format={(n) => `${Math.round(n)} ms`} endLabels yMin={0} accessibilityLabel="Time to find each target in order" />
            </Card>
          ) : null}
          {s.game === 'memory' && s.error_points.length ? (
            <Card>
              <Txt v="h3">Where it went wrong</Txt>
              <Txt v="small">{s.error_points.map((e) => `length ${e.len}, step ${e.step + 1}`).join(' · ')}</Txt>
            </Card>
          ) : null}
        </>
      ) : (
        <Card><Txt v="body" color={C.sub}>No hits were recorded in this round.</Txt></Card>
      )}

      {/* After the statistics: the plan for next time, from the same stored figures. */}
      {insights && s && session.status === 'completed' ? <SessionInsights sessionId={session.id} /> : null}
    </View>
  );
}
