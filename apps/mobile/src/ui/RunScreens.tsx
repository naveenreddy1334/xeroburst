// Screens for playing several levels in one go: the short "level complete" card between levels and the
// run summary at the end. Every number here is added up from the per-level summaries the server computed,
// with the same definitions as one round (hits + misses = events).

import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { GAMES, fmtDuration, runTotals } from '@nboard/shared';
import type { FinishResponse, GameSlug, Summary } from '@nboard/shared';
import { Screen } from './Screen';
import { Txt } from './Txt';
import { Button } from './Button';
import { Card } from './Card';
import { Badge } from './Chip';
import { Icon } from './Icon';
import { Banner } from './States';
import { Stat, StatRow } from './Stat';
import { ResultView } from './ResultView';
import { SessionInsights } from './Insights';
import { C, alpha } from '../theme/tokens';
import { useCountUp } from './motion';

const sums = (rs: FinishResponse[]): Summary[] => rs.map((r) => r.session.summary).filter((s): s is Summary => !!s);

/** Shown for a few seconds between levels, then the next level starts by itself. */
export function LevelComplete({ game, done, next, maxLevel, accent, seconds = 4, onNow, onStop }: { game: GameSlug; done: FinishResponse[]; next: number; maxLevel: number; accent: string; seconds?: number; onNow: () => void; onStop: () => void }) {
  const [left, setLeft] = useState(seconds);
  const gone = useRef(false);
  const last = done[done.length - 1]!;
  const s = last.session.summary;
  useEffect(() => {
    if (gone.current) return;
    if (left <= 0) {
      gone.current = true;
      onNow();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);
  return (
    <Screen center maxWidth={560} testID="level-complete">
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Icon name="check" size={44} color={C.success} strokeWidth={2.4} />
        <Txt v="label">{GAMES[game].name}</Txt>
        <Txt v="display" align="center">Level {last.session.level} complete</Txt>
      </View>
      {s ? (
        <StatRow>
          <Stat label="Hits" value={String(s.correct_hits)} color={C.success} />
          <Stat label="Misses" value={String(s.misses)} color={s.misses ? C.danger : C.text} />
          <Stat label="Accuracy" value={`${Math.round(s.accuracy)}%`} />
        </StatRow>
      ) : null}
      <View style={{ alignItems: 'center', gap: 4, padding: 16, borderRadius: 18, backgroundColor: alpha(accent, 0.1), borderWidth: 1.5, borderColor: alpha(accent, 0.4) }}>
        <Txt v="label">Next up</Txt>
        <Txt v="display" color={accent}>Level {next}</Txt>
        <Txt v="small">Starting in {Math.max(left, 0)}… (up to level {maxLevel})</Txt>
      </View>
      <Button label={`Start level ${next} now`} icon="play" size="lg" full variant="accent" color={accent} preferredFocus onPress={() => { if (gone.current) return; gone.current = true; onNow(); }} testID="next-level-now" />
      <Button label="Stop and see my results" variant="secondary" full onPress={() => { gone.current = true; onStop(); }} testID="stop-run" />
    </Screen>
  );
}

/** The end of a run. With one level it is the normal result; with several it adds the levels up. */
export function RunSummary({ game, done, accent, startLevel, saved, onAgain, onOther, onDone, doneLabel }: { game: GameSlug; done: FinishResponse[]; accent: string; startLevel: number; saved: 'uploaded' | 'outbox' | null; onAgain: () => void; onOther: () => void; onDone: () => void; doneLabel: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const info = GAMES[game];
  const multi = done.length > 1;
  const totals = runTotals(sums(done));
  const hitsAnim = useCountUp(multi ? totals.hits : null, 700, 0);
  const lastRes = done[done.length - 1]!;

  if (!multi) {
    return (
      <Screen testID="screen-result">
        <View style={{ gap: 6 }}>
          <Txt v="label">{lastRes.session.status === 'completed' ? 'Round complete' : 'Round stopped'}</Txt>
          <Txt v="display">{lastRes.session.status === 'completed' ? 'Nice work' : 'Stopped and saved'}</Txt>
        </View>
        {saved === 'outbox' ? <Banner icon="refresh" color={C.warning}>Saved on this device. It uploads when the server is reachable, and personal bests update then.</Banner> : null}
        <ResultView session={lastRes.session} previous={lastRes.previous} delta={lastRes.delta} is_pb={lastRes.is_pb} state_change={lastRes.state_change} />
        <View style={{ gap: 10 }}>
          <Button label="Play again" icon="refresh" size="lg" full variant="accent" color={accent} preferredFocus onPress={onAgain} testID="play-again" />
          <Button label="Choose another game" variant="secondary" full onPress={onOther} />
          <Button label={doneLabel} variant="ghost" full onPress={onDone} />
        </View>
      </Screen>
    );
  }

  const first = done[0]!.session.level;
  const lastLevel = lastRes.session.level;
  return (
    <Screen testID="screen-run-summary">
      <View style={{ gap: 6 }}>
        <Txt v="label">{info.name} · Levels {first} to {lastLevel}</Txt>
        <Txt v="display">{lastRes.session.status === 'completed' ? 'Run complete' : 'Run ended'}</Txt>
      </View>
      {saved === 'outbox' ? <Banner icon="refresh" color={C.warning}>Some rounds are saved on this device. They upload when the server is reachable.</Banner> : null}

      <View style={{ backgroundColor: alpha(accent, 0.1), borderWidth: 1.5, borderColor: alpha(accent, 0.45), borderRadius: 22, padding: 20, gap: 4 }}>
        <Txt v="label">Total hits</Txt>
        <Txt v="display" size={64} color={accent} style={{ lineHeight: 68 }} testID="run-hits">{hitsAnim}</Txt>
        <Txt v="small">{totals.levels} levels · {fmtDuration(totals.duration_ms)} played</Txt>
      </View>
      <StatRow>
        <Stat label="Hits" value={String(totals.hits)} color={C.success} icon="check" />
        <Stat label="Misses" value={String(totals.misses)} color={totals.misses ? C.danger : C.text} note={totals.misses ? `${totals.timeouts} timed out · ${totals.wrong + totals.distractor} wrong presses` : undefined} />
        <Stat label="Accuracy" value={`${totals.accuracy.toFixed(0)}%`} />
        <Stat label="Average" value={totals.avg_rt === null ? '--' : String(totals.avg_rt)} unit="ms" />
      </StatRow>

      <Txt v="h2">Level by level</Txt>
      <View style={{ gap: 10 }}>
        {done.map((r, i) => {
          const s = r.session.summary;
          const isOpen = open === i;
          return (
            <View key={r.session.id} style={{ gap: 10 }}>
              <Card accent={isOpen ? accent : undefined} onPress={() => setOpen(isOpen ? null : i)} accessibilityLabel={`Level ${r.session.level} details`} testID={`run-level-${r.session.level}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <Badge label={`Level ${r.session.level}`} color={accent} />
                  {r.session.status !== 'completed' ? <Badge label="Stopped" color={C.warning} /> : null}
                  {r.is_pb || r.session.is_pb ? <Badge label="Personal best" color={C.warning} icon="trophy" filled /> : null}
                  <View style={{ flex: 1 }} />
                  <Txt v="mono" color={C.success}>{s?.correct_hits ?? 0} hits</Txt>
                  <Txt v="mono" color={s?.misses ? C.danger : C.sub}>{s?.misses ?? 0} misses</Txt>
                  <Txt v="mono" color={C.sub}>{s?.avg_rt != null ? `${Math.round(s.avg_rt)} ms` : '--'}</Txt>
                  <Icon name={isOpen ? 'chevronDown' : 'chevron'} size={18} color={C.sub} />
                </View>
              </Card>
              {isOpen ? <ResultView session={r.session} previous={r.previous} delta={r.delta} is_pb={r.is_pb} state_change={r.state_change} insights={false} /> : null}
            </View>
          );
        })}
      </View>

      {lastRes.session.status === 'completed' ? <SessionInsights sessionId={lastRes.session.id} /> : null}

      <View style={{ gap: 10 }}>
        <Button label={`Play again from level ${startLevel}`} icon="refresh" size="lg" full variant="accent" color={accent} preferredFocus onPress={onAgain} testID="play-again" />
        <Button label="Choose another game" variant="secondary" full onPress={onOther} />
        <Button label={doneLabel} variant="ghost" full onPress={onDone} />
      </View>
    </Screen>
  );
}
