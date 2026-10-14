// S18 Player profile: details, status, PIN reset, coach, game access, program and recent results.

import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GAMES, GAME_SLUGS, fmtMetric, fmtMs, primaryValue, validatePin } from '@nboard/shared';
import type { AccessItem, AnalyticsResponse, GameSlug, Page, PerformanceResponse, PlayerDetail, PlayerProgramDTO, ProgramDTO, ResetPlayerResponse, SessionDTO, UserDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { useCan } from '../../../state/auth';
import { useCredentials } from '../../../state/ui';
import { LineChart } from '../../../charts/Charts';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Badge, Chip } from '../../../ui/Chip';
import { Dialog } from '../../../ui/Dialog';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ProgressBar, StageTrack } from '../../../ui/Progress';
import { Stat, StatRow, SectionTitle } from '../../../ui/Stat';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Toggle } from '../../../ui/Toggle';
import { PerformanceProfile } from '../../../ui/Performance';
import { InsightsPanel } from '../../../ui/Insights';
import { Avatar } from '../../../ui/Avatar';
import { Txt } from '../../../ui/Txt';
import { checkPlayerCore, numOrUndef } from '../../../lib/validate';
import { FieldErrors, IconButton, StateBadge, TvNotice, gridStyle, timeAgo, useAction } from '../../../staff/players-common';

interface AccessPatch {
  state?: 'locked' | 'unlocked' | 'completed';
  level_cap?: number | null;
  target_sessions?: number | null;
  target_level?: number | null;
  target_accuracy?: number | null;
}

type Runner = ReturnType<typeof useAction>['run'];

const numOrNull = (s: string): number | null | undefined => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
};

// ---- Details -------------------------------------------------------------------------------------------------

function DetailsCard({ p, canEdit, run, busy, fields }: { p: PlayerDetail; canEdit: boolean; run: Runner; busy: string | null; fields: Record<string, string> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.display_name);
  const [age, setAge] = useState(p.age === null ? '' : String(p.age));
  const [weight, setWeight] = useState(p.weight_kg === null ? '' : String(p.weight_kg));
  const [notes, setNotes] = useState(p.notes ?? '');
  const [local, setLocal] = useState<Record<string, string>>({});

  function open() {
    setName(p.display_name);
    setAge(p.age === null ? '' : String(p.age));
    setWeight(p.weight_kg === null ? '' : String(p.weight_kg));
    setNotes(p.notes ?? '');
    setLocal({});
    setEditing(true);
  }

  async function save() {
    const e = checkPlayerCore({ display_name: name, age, weight });
    const a = numOrUndef(age) as number;
    const w = numOrUndef(weight) as number;
    setLocal(e);
    if (Object.keys(e).length) return;
    const r = await run('details', () => api.patch(`/players/${p.id}`, { display_name: name.trim(), age: a, weight_kg: w, notes: notes.trim() || null }), 'Details saved');
    if (r.ok) setEditing(false);
  }

  const err = { ...fields, ...local };
  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Txt v="h2" style={{ flex: 1 }}>
          Details
        </Txt>
        {canEdit && !editing ? <Button label="Edit" icon="edit" size="sm" variant="secondary" onPress={open} /> : null}
      </View>
      {editing ? (
        <>
          <Txt v="small">Fields marked * are required. Older records without an age or weight must have them filled in to save.</Txt>
          <Field label="Name" required value={name} onChangeText={setName} autoCapitalize="words" error={err.display_name} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>
              <Field label="Age" required value={age} onChangeText={setAge} keyboardType="number-pad" tvKeyboard="numeric" error={err.age} />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 140 }}>
              <Field label="Weight (kg)" required value={weight} onChangeText={setWeight} keyboardType="decimal-pad" tvKeyboard="numeric" error={err.weight_kg} />
            </View>
          </View>
          <Field label="Notes" value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" error={err.notes} />
          <FieldErrors fields={err} skip={['display_name', 'age', 'weight_kg', 'notes']} />
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
            <Button label="Save" icon="check" loading={busy === 'details'} onPress={save} />
            <Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} />
          </View>
        </>
      ) : (
        <View style={{ gap: 6 }}>
          <Txt v="body">Age: {p.age ?? '--'}</Txt>
          <Txt v="body">Weight: {p.weight_kg === null ? '--' : `${p.weight_kg} kg`}</Txt>
          <Txt v="body" color={p.notes ? C.text : C.sub}>
            {p.notes || 'No notes'}
          </Txt>
          <Txt v="small">Created {timeAgo(p.created_at)}</Txt>
        </View>
      )}
    </Card>
  );
}

// ---- Coach ------------------------------------------------------------------------------------------------------

function CoachCard({ p, canReassign, run, busy }: { p: PlayerDetail; canReassign: boolean; run: Runner; busy: string | null }) {
  const coaches = useGet<Page<UserDTO>>('/users', { role: 'COACH', active: '1', limit: 100 }, { enabled: canReassign });
  const [pick, setPick] = useState<string | null>(null);
  return (
    <Card style={{ gap: 10 }}>
      <Txt v="h2">Coach</Txt>
      <Txt v="body">{p.coach?.name ?? 'No coach'}</Txt>
      {canReassign ? (
        coaches.isLoading ? (
          <LoadingBlock label="Loading coaches" />
        ) : coaches.isError ? (
          <ErrorBlock error={coaches.error} onRetry={() => void coaches.refetch()} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(coaches.data?.items ?? []).map((c) => (
                <Chip key={c.id} label={c.display_name} icon="user" selected={(pick ?? p.coach?.id) === c.id} onPress={() => setPick(c.id)} />
              ))}
            </View>
            <Button
              label="Reassign coach"
              variant="secondary"
              disabled={!pick || pick === p.coach?.id}
              loading={busy === 'coach'}
              onPress={async () => {
                const r = await run('coach', () => api.put(`/players/${p.id}/coach`, { coach_id: pick }), 'Coach changed');
                if (r.ok) setPick(null);
              }}
            />
          </>
        )
      ) : null}
    </Card>
  );
}

// ---- Game access ----------------------------------------------------------------------------------------------------

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Txt v="label">{label}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <IconButton icon="chevronDown" label={`Lower ${label}`} rotate={90} disabled={value <= min} onPress={() => onChange(value - 1)} />
        <Txt v="num" size={24} style={{ minWidth: 44, textAlign: 'center' }}>
          {value}
        </Txt>
        <IconButton icon="chevronDown" label={`Raise ${label}`} rotate={-90} disabled={value >= max} onPress={() => onChange(value + 1)} />
        {value === max ? <Txt v="small">max</Txt> : null}
      </View>
    </View>
  );
}

function AccessRow({ a, editState, editLimits, run, busy, playerId }: { a: AccessItem; editState: boolean; editLimits: boolean; run: Runner; busy: string | null; playerId: string }) {
  const info = GAMES[a.game];
  const [cap, setCap] = useState(a.level_cap ?? info.maxLevel);
  const [sessions, setSessions] = useState(a.target_sessions === null ? '' : String(a.target_sessions));
  const [level, setLevel] = useState(a.target_level === null ? '' : String(a.target_level));
  const [acc, setAcc] = useState(a.target_accuracy === null ? '' : String(a.target_accuracy));
  const [local, setLocal] = useState<Record<string, string>>({});

  const send = (key: string, body: AccessPatch, ok: string) => run(key, () => api.put(`/players/${playerId}/access/${a.game}`, body), ok);

  const dirty =
    cap !== (a.level_cap ?? info.maxLevel) ||
    sessions !== (a.target_sessions === null ? '' : String(a.target_sessions)) ||
    level !== (a.target_level === null ? '' : String(a.target_level)) ||
    acc !== (a.target_accuracy === null ? '' : String(a.target_accuracy));

  function saveLimits() {
    const s = numOrNull(sessions);
    const l = numOrNull(level);
    const ac = numOrNull(acc);
    const e: Record<string, string> = {};
    if (s === undefined || (s !== null && (!Number.isInteger(s) || s < 1 || s > 100))) e.target_sessions = '1 to 100.';
    if (l === undefined || (l !== null && (!Number.isInteger(l) || l < info.minLevel || l > info.maxLevel))) e.target_level = `${info.minLevel} to ${info.maxLevel}.`;
    if (ac === undefined || (ac !== null && (ac < 0 || ac > 100))) e.target_accuracy = '0 to 100.';
    setLocal(e);
    if (Object.keys(e).length) return;
    void send('limits-' + a.game, { level_cap: cap >= info.maxLevel ? null : cap, target_sessions: s, target_level: l, target_accuracy: ac }, `${info.name} updated`);
  }

  const b = busy ?? '';
  return (
    <Card accent={info.accent} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Icon name={info.icon} size={26} color={info.accent} />
        <Txt v="h3" style={{ flex: 1 }}>
          {info.name}
        </Txt>
        {a.manual ? <Badge label="Manual" icon="edit" color={C.warning} /> : null}
        <StateBadge state={a.state} />
      </View>
      {editLimits ? (
        <>
          <Stepper label="Level cap" value={cap} min={info.minLevel} max={info.maxLevel} onChange={setCap} />
          <Txt v="label">Targets to complete</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <View style={{ flexGrow: 1, flexBasis: 100 }}>
              <Field label="Sessions" value={sessions} onChangeText={setSessions} keyboardType="number-pad" tvKeyboard="numeric" placeholder="None" error={local.target_sessions} />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}>
              <Field label="Level" value={level} onChangeText={setLevel} keyboardType="number-pad" tvKeyboard="numeric" placeholder="None" error={local.target_level} />
            </View>
            <View style={{ flexGrow: 1, flexBasis: 100 }}>
              <Field label="Accuracy %" value={acc} onChangeText={setAcc} keyboardType="decimal-pad" tvKeyboard="numeric" placeholder="None" error={local.target_accuracy} />
            </View>
          </View>
          <Button label="Save limits" icon="check" size="sm" variant="secondary" disabled={!dirty} loading={b === 'limits-' + a.game} onPress={saveLimits} />
        </>
      ) : (
        <View style={{ gap: 4 }}>
          <Txt v="small" color={C.text}>
            Level cap: {a.level_cap ?? info.maxLevel}
          </Txt>
          <Txt v="small">
            Targets: {a.target_sessions ?? '--'} sessions, level {a.target_level ?? '--'}, accuracy {a.target_accuracy === null ? '--' : `${a.target_accuracy}%`}
          </Txt>
        </View>
      )}
      {editState ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {a.state === 'locked' || a.state === 'completed' ? (
            <Button label={a.state === 'locked' ? 'Unlock' : 'Reopen'} icon="check" size="sm" loading={b === 'state-' + a.game} onPress={() => void send('state-' + a.game, { state: 'unlocked' }, `${info.name} unlocked`)} />
          ) : null}
          {a.state === 'unlocked' ? <Button label="Complete" icon="trophy" size="sm" variant="secondary" loading={b === 'state-' + a.game} onPress={() => void send('state-' + a.game, { state: 'completed' }, `${info.name} completed`)} /> : null}
          {a.state !== 'locked' ? <Button label="Lock" icon="lock" size="sm" variant="danger" loading={b === 'state-' + a.game} onPress={() => void send('state-' + a.game, { state: 'locked' }, `${info.name} locked`)} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

function AccessSection({ id, editState, editLimits, run, busy, fields }: { id: string; editState: boolean; editLimits: boolean; run: Runner; busy: string | null; fields: Record<string, string> }) {
  const { cols } = useDevice();
  const q = useGet<{ items: AccessItem[] }>(`/players/${id}/access`);
  const items = q.data?.items ?? [];
  const sorted = GAME_SLUGS.map((s) => items.find((i) => i.game === s)).filter((x): x is AccessItem => !!x);
  return (
    <>
      <SectionTitle>Games</SectionTitle>
      {q.isLoading ? (
        <LoadingBlock label="Loading games" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyBlock icon="board" title="No games" />
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {sorted.map((a) => (
              <View key={`${a.game}-${a.state}-${a.level_cap}-${a.target_sessions}-${a.target_level}-${a.target_accuracy}`} style={[gridStyle(Math.min(cols, 2)), { flexDirection: 'column' }]}>
                <AccessRow a={a} editState={editState} editLimits={editLimits} run={run} busy={busy} playerId={id} />
              </View>
            ))}
          </View>
          <FieldErrors fields={fields} />
        </>
      )}
    </>
  );
}

// ---- Program ------------------------------------------------------------------------------------------------------------

function ProgramSection({ id, canAssign, canMove, run, busy }: { id: string; canAssign: boolean; canMove: boolean; run: Runner; busy: string | null }) {
  const q = useGet<{ assignment: PlayerProgramDTO | null }>(`/players/${id}/program`);
  const programs = useGet<{ items: ProgramDTO[] }>('/programs', undefined, { enabled: canAssign });
  const [changing, setChanging] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const as = q.data?.assignment ?? null;
  const usable = (programs.data?.items ?? []).filter((p) => !p.retired && p.stages.length > 0);

  const assign = async () => {
    if (!pick) return;
    const r = await run('assign', () => api.put(`/players/${id}/program`, { program_id: pick }), 'Program assigned');
    if (r.ok) {
      setChanging(false);
      setPick(null);
    }
  };

  const chooser = canAssign && (!as || changing) ? (
    <View style={{ gap: 10 }}>
      <Txt v="label">{as ? 'Change program (restarts at stage 1)' : 'Assign a program'}</Txt>
      {programs.isLoading ? (
        <LoadingBlock label="Loading programs" />
      ) : programs.isError ? (
        <ErrorBlock error={programs.error} onRetry={() => void programs.refetch()} />
      ) : usable.length === 0 ? (
        <Txt v="small">No programs available. Create one under Programs.</Txt>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {usable.map((p) => (
            <Chip key={p.id} label={p.name} icon="list" selected={pick === p.id} onPress={() => setPick(p.id)} />
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <Button label="Assign" icon="check" disabled={!pick} loading={busy === 'assign'} onPress={assign} />
        {changing ? <Button label="Cancel" variant="secondary" onPress={() => setChanging(false)} /> : null}
      </View>
    </View>
  ) : null;

  return (
    <>
      <SectionTitle>Program</SectionTitle>
      {q.isLoading ? (
        <LoadingBlock label="Loading program" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <Card style={{ gap: 14 }}>
          {as ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Txt v="h3" style={{ flex: 1 }}>
                  {as.program.name}
                </Txt>
                <Txt v="small" color={C.text}>
                  Stage {as.current_stage}/{as.stage_count}
                </Txt>
              </View>
              <ProgressBar value={as.progress_pct} label="Program progress" />
              <StageTrack stages={as.program.stages} current={as.current_stage} />
              {canMove ? (
                <View style={{ gap: 10 }}>
                  <Button label="Advance stage" icon="chevron" disabled={as.current_stage >= as.stage_count} loading={busy === 'advance'} onPress={() => void run('advance', () => api.post(`/players/${id}/program/advance`, {}), 'Advanced')} />
                  <Txt v="label">Set stage</Txt>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {as.program.stages.map((s) => (
                      <Chip key={s.stage_no} label={`${s.stage_no}. ${s.label}`} selected={s.stage_no === as.current_stage} onPress={() => (s.stage_no === as.current_stage ? undefined : void run('stage', () => api.put(`/players/${id}/program/stage`, { stage: s.stage_no }), `Stage ${s.stage_no}`))} />
                    ))}
                  </View>
                </View>
              ) : null}
              {canAssign && !changing ? <Button label="Change program" variant="secondary" size="sm" onPress={() => setChanging(true)} /> : null}
            </>
          ) : (
            <Txt v="body" color={C.sub}>
              No program assigned.
            </Txt>
          )}
          {chooser}
        </Card>
      )}
    </>
  );
}

// ---- Results --------------------------------------------------------------------------------------------------------------

function ResultsSection({ id }: { id: string }) {
  const router = useRouter();
  const results = useGet<Page<SessionDTO>>(`/players/${id}/results`, { limit: 8 });
  const an = useGet<AnalyticsResponse>(`/players/${id}/analytics`, { range: 'week' });
  return (
    <>
      <SectionTitle>This week</SectionTitle>
      {an.isLoading ? (
        <LoadingBlock label="Loading analytics" />
      ) : an.isError ? (
        <ErrorBlock error={an.error} onRetry={() => void an.refetch()} />
      ) : an.data ? (
        <>
          <StatRow>
            <Stat label="Sessions" value={String(an.data.totals.sessions)} note={`Last week ${an.data.previous.sessions}`} icon="chart" />
            <Stat label="Average RT" value={an.data.totals.avg_rt === null ? '--' : String(Math.round(an.data.totals.avg_rt))} unit="ms" icon="clock" />
            <Stat label="Streak" value={String(an.data.streak.current)} unit="days" note={`Longest ${an.data.streak.longest}`} icon="flame" />
          </StatRow>
          <Card style={{ gap: 8 }}>
            <Txt v="label">Average reaction time</Txt>
            <LineChart data={an.data.series.map((s) => s.avg_rt)} labels={an.data.series.map((s) => s.label)} format={(n) => `${Math.round(n)}`} accessibilityLabel="Average reaction time per day this week" />
          </Card>
        </>
      ) : null}

      <SectionTitle>Recent results</SectionTitle>
      {results.isLoading ? (
        <LoadingBlock label="Loading results" />
      ) : results.isError ? (
        <ErrorBlock error={results.error} onRetry={() => void results.refetch()} />
      ) : !results.data?.items.length ? (
        <EmptyBlock icon="chart" title="No sessions yet" message="Results show up here after the first round." />
      ) : (
        <View style={{ gap: 10 }}>
          {results.data.items.map((s) => (
            <Card key={s.id} onPress={() => router.push(`/results/${s.id}` as never)} accent={GAMES[s.game].accent} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name={GAMES[s.game].icon} size={24} color={GAMES[s.game].accent} />
              <View style={{ flex: 1 }}>
                <Txt v="bodyStrong" numberOfLines={1}>
                  {GAMES[s.game].name} - level {s.level}
                </Txt>
                <Txt v="small">{timeAgo(s.ended_at ?? s.started_at)}</Txt>
              </View>
              {s.is_pb ? <Badge label="PB" icon="trophy" color={C.highlight} /> : null}
              {s.status !== 'completed' ? <Badge label={s.status} color={s.status === 'aborted' ? C.danger : C.warning} /> : null}
              <Txt v="mono">{fmtMetric(s.game, primaryValue(s.summary))}</Txt>
            </Card>
          ))}
        </View>
      )}
    </>
  );
}

// ---- Performance profile (coach view) ------------------------------------------------------------------------------------

function PerformanceSection({ id, name }: { id: string; name: string }) {
  const q = useGet<PerformanceResponse>(`/players/${id}/performance`);
  if (q.isLoading) return <LoadingBlock label="Loading performance" />;
  if (q.isError || !q.data) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  return (
    <>
      <SectionTitle>Performance</SectionTitle>
      <PerformanceProfile perf={q.data} />
      <InsightsPanel result={q.data.insights} empty={`${name} has no completed rounds yet. A plan appears after the first round.`} />
    </>
  );
}

// ---- Page ------------------------------------------------------------------------------------------------------------------------

function Profile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tv } = useDevice();
  const can = useCan();
  const act = useAction(['/players', '/programs']);
  const { run, busy, fields } = act;

  const q = useGet<PlayerDetail>(`/players/${id}`);
  const [resetOpen, setResetOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const canPlayers = can('MANAGE_PLAYERS') && !tv;
  const canCoach = can('MANAGE_COACHES') && !tv;
  const canAccess = can('MANAGE_GAME_ACCESS') && !tv;
  const canProgress = can('MANAGE_GAME_PROGRESS') && !tv;
  const canPrograms = can('MANAGE_PROGRAMS') && !tv;

  async function refresh() {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }
  // Sub-sections refetch through invalidation when any write completes; pull-to-refresh reloads the header data.

  async function reset() {
    if (!q.data) return;
    if (pin) {
      const bad = validatePin(pin);
      if (bad) return setPinErr(bad);
    }
    setPinErr(null);
    const r = await run('reset', () => api.post<ResetPlayerResponse>(`/players/${id}/reset-credentials`, pin ? { pin } : {}));
    if (!r.ok) return;
    setResetOpen(false);
    setPin('');
    useCredentials.getState().show({
      kind: 'player',
      name: q.data.display_name,
      loginId: r.value.credentials.login_id,
      secret: r.value.credentials.pin,
      secretLabel: 'PIN',
      note: 'The old PIN no longer works. The new PIN is not shown again.',
      back: `/players/${id}`,
    });
    router.push('/players/credentials' as never);
  }

  const p = q.data;
  return (
    <Screen refreshing={refreshing} onRefresh={() => void refresh()} testID="screen-player">
      <Header title={p?.display_name ?? 'Player'} subtitle={p?.player_code} back="/players" />
      {tv ? <TvNotice /> : null}
      {q.isLoading ? (
        <LoadingBlock label="Loading player" />
      ) : q.isError || !p ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <>
          <Card accent={C.primary} style={{ gap: 14 }} testID="player-hero">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <Avatar name={p.display_name} size={64} />
              <View style={{ flex: 1, flexBasis: 220, gap: 6 }}>
                <Txt v="h1" numberOfLines={1}>{p.display_name}</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <Txt v="mono" color={C.highlight} size={16}>{p.player_code}</Txt>
                  <Badge label={p.status === 'active' ? 'Active' : 'Inactive'} color={p.status === 'active' ? C.success : C.lockedText} />
                  {p.is_locked ? <Badge label="Locked out" icon="lock" color={C.danger} /> : null}
                  {p.coach ? <Badge label={`Coach ${p.coach.name.replace(/^coach\s+/i, '')}`} icon="users" color={C.sub} /> : null}
                </View>
                <Txt v="small">
                  {p.games_unlocked}/{p.games_total || 4} games unlocked · {p.perf.sessions} completed {p.perf.sessions === 1 ? 'round' : 'rounds'} · last session {timeAgo(p.last_session_at)}
                </Txt>
              </View>
            </View>
            {canPlayers ? (
              <View style={{ gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 }}>
                <Toggle
                  label="Player is active"
                  hint="Inactive players cannot sign in."
                  value={p.status === 'active'}
                  onLabel="ACTIVE"
                  offLabel="INACTIVE"
                  disabled={busy === 'status'}
                  onChange={(v) => void run('status', () => api.patch(`/players/${id}`, { status: v ? 'active' : 'inactive' }), v ? 'Player activated' : 'Player deactivated')}
                />
                <Button label="Reset PIN" icon="key" variant="secondary" onPress={() => { setPin(''); setPinErr(null); setResetOpen(true); }} />
              </View>
            ) : null}
          </Card>

          <PerformanceSection id={String(id)} name={p.display_name} />
          <ResultsSection id={String(id)} />

          <SectionTitle>Manage player</SectionTitle>
          <DetailsCard key={p.id + p.display_name + p.age + p.weight_kg + p.notes} p={p} canEdit={canPlayers} run={run} busy={busy} fields={fields} />
          <CoachCard p={p} canReassign={canCoach} run={run} busy={busy} />
          <AccessSection id={String(id)} editState={canAccess || canProgress} editLimits={canAccess} run={run} busy={busy} fields={fields} />
          <ProgramSection id={String(id)} canAssign={canPrograms} canMove={canProgress} run={run} busy={busy} />
        </>
      )}

      <Dialog visible={resetOpen} title="Reset PIN" message="The player's old PIN stops working straight away. The new PIN is shown once." confirmLabel="Reset PIN" loading={busy === 'reset'} onConfirm={reset} onCancel={() => setResetOpen(false)}>
        <Field label="New PIN (optional)" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, ''))} keyboardType="number-pad" tvKeyboard="numeric" maxLength={12} error={pinErr ?? fields.pin} hint="Leave blank and the server picks one." />
      </Dialog>
    </Screen>
  );
}

export default function PlayerProfile() {
  return (
    <RequirePermission any={['MANAGE_PLAYERS', 'VIEW_RESULTS']}>
      <Profile />
    </RequirePermission>
  );
}
