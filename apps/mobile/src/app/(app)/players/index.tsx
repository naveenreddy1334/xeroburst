// Players, laid out exactly like the design: roster and training at the left, the chosen player's profile, performance and insights at the right.
// All of it is live: the roster, the training controls (program, stage, game access and level cap), photo, PIN reset, the full
// round history as a table, and "Mark inactive" with a reason.

import { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { GAMES, GAME_SLUGS } from '@nboard/shared';
import type { AccessItem, CreatedPlayerResponse, HubDTO, Page, PerformanceResponse, PlayerDetail, PlayerListItem, ProgramDTO, ResetPlayerResponse, UserDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { glassLo, neoIn } from '../../../theme/surfaces';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { useAuth, useCan } from '../../../state/auth';
import { usePresetHub, useSearch, useSelPlayer } from '../../../state/shell';
import { useCredentials } from '../../../state/ui';
import { usePhotos } from '../../../state/photos';
import { pickPhoto } from '../../../lib/pickPhoto';
import { checkPlayerCore, numOrUndef } from '../../../lib/validate';
import { WeekChart } from '../../../charts/RoundCharts';
import type { WeekSeries } from '../../../charts/RoundCharts';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Avatar } from '../../../ui/Avatar';
import { CardH, Empty, Facts, Pill, X } from '../../../ui/Bits';
import { Select } from '../../../ui/Select';
import { Field } from '../../../ui/Field';
import { InsightsPanel } from '../../../ui/Insights';
import { HistoryTable } from '../../../ui/HistoryTable';
import { LoadingBlock } from '../../../ui/States';
import { Icon } from '../../../ui/Icon';
import { toast } from '../../../ui/Toast';
import { useAction } from '../../../staff/players-common';

const ROLE: Record<string, string> = { SUPER_ADMIN: 'Super Admin', ADMIN: 'Admin', COACH: 'Coach', PLAYER: 'Player' };
const WEEK = 7 * 86_400_000;

/** from-[#9400D3]/30 to-[#315BFF]/20, left to right. */
function SoftSelected() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="ps" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#9400D3" stopOpacity={0.3} />
            <Stop offset="1" stopColor="#315BFF" stopOpacity={0.2} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ps)" />
      </Svg>
    </View>
  );
}

const mean = (a: number[]) => (a.length ? a.reduce((p, c) => p + c, 0) / a.length : null);

/** Weekly figures for the last eight weeks from the stored rounds; with rounds in fewer than two weeks it shows one point per round. */
function weekly(perf: PerformanceResponse | undefined): { labels: string[]; series: WeekSeries[]; em: string } | null {
  const t = perf?.trend ?? [];
  if (!t.length) return null;
  const now = Date.now();
  const buckets: typeof t[] = Array.from({ length: 8 }, () => []);
  for (const p of t) {
    const k = 7 - Math.floor((now - Date.parse(p.started_at)) / WEEK);
    if (k >= 0 && k < 8) buckets[k]!.push(p);
  }
  const used = buckets.map((b, i) => ({ b, i })).filter((x) => x.b.length);
  const mk = (rows: typeof t[]): WeekSeries[] => [
    { name: 'Avg reaction (ms)', color: '#35C7FF', axis: 0, data: rows.map((b) => { const m = mean(b.filter((p) => p.avg_rt !== null).map((p) => p.avg_rt as number)); return m === null ? null : Math.round(m); }) },
    { name: 'Fastest (ms)', color: '#B84AFF', axis: 0, data: rows.map((b) => { const v = b.filter((p) => p.best_rt !== null).map((p) => p.best_rt as number); return v.length ? Math.min(...v) : null; }) },
    { name: 'Accuracy (%)', color: '#6c8cff', axis: 1, data: rows.map((b) => { const m = mean(b.map((p) => p.accuracy)); return m === null ? null : Math.round(m * 10) / 10; }) },
    { name: 'Misses', color: '#FF4778', axis: 2, dash: true, data: rows.map((b) => { const m = mean(b.map((p) => p.misses)); return m === null ? null : Math.round(m); }) },
  ];
  if (used.length >= 2) return { labels: used.map((x) => 'W' + (x.i + 1)), series: mk(used.map((x) => x.b)), em: '8 weeks' };
  const last = t.slice(-12);
  return { labels: last.map((_, i) => 'R' + (i + 1)), series: mk(last.map((p) => [p])), em: `${last.length} rounds` };
}

function DeactForm({ onDone, onSubmit, busy }: { onDone: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const { u } = useDevice();
  const [r, setR] = useState('');
  const [err, setErr] = useState('');
  return (
    <View>
      <Field label="Reason for inactive" required multiline value={r} onChangeText={(v) => { setR(v); setErr(''); }} placeholder="e.g. Injury, away until 20 Oct" error={err} autoCapitalize="sentences" />
      <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
        <View style={{ flex: 1 }}>
          <Button size="sm" variant="danger" full label="Mark inactive" loading={busy} onPress={() => (r.trim().length < 3 ? setErr('Enter a reason, for example injury or away until a date.') : onSubmit(r.trim()))} />
        </View>
        <Button size="sm" variant="ghost" label="Cancel" onPress={onDone} />
      </View>
    </View>
  );
}

function NewPlayerCard({ onCreated }: { onCreated: (id: string) => void }) {
  const { u, tv } = useDevice();
  const can = useCan();
  const pickCoach = can('MANAGE_COACHES');
  const pickHub = can('MANAGE_HUBS');
  const [hub, setHub] = useState(usePresetHub.getState().id ?? '');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [coach, setCoach] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const act = useAction(['/players', '/programs']);
  const coaches = useGet<Page<UserDTO>>('/users', { role: 'COACH', active: '1', limit: 100 }, { enabled: pickCoach });
  const hubs = useGet<{ items: HubDTO[] }>('/hubs', undefined, { enabled: pickHub });
  const hopts = (hubs.data?.items ?? []).filter((h) => h.is_active).map((h) => ({ value: h.id, label: h.name }));
  const copts = (coaches.data?.items ?? []).map((c) => ({ value: c.id, label: c.display_name }));
  const router = useRouter();

  async function create() {
    const e: Record<string, string> = checkPlayerCore({ display_name: name, age, weight });
    if (pickCoach && !coach) e.coach_id = 'Choose a Coach for this player.';
    setErrs(e);
    if (Object.keys(e).length) return;
    const r = await act.run('create', () => api.post<CreatedPlayerResponse>('/players', { display_name: name.trim(), age: numOrUndef(age), weight_kg: numOrUndef(weight), ...(pickCoach ? { coach_id: coach } : {}), ...(pickHub && hub ? { hub_id: hub } : {}) }));
    if (!r.ok) {
      setErrs({ ...act.fields });
      return;
    }
    useCredentials.getState().show({ kind: 'player', name: r.value.player.display_name, loginId: r.value.credentials.login_id, secret: r.value.credentials.pin, secretLabel: 'PIN', note: 'Give these to the player. The PIN is not shown again.', back: '/players' });
    onCreated(r.value.player.id);
    router.push('/players/credentials' as never);
  }

  return (
    <Card style={{ marginBottom: u }}>
      <CardH em="all fields required">New player</CardH>
      <Field label="Full name" required value={name} onChangeText={setName} autoCapitalize="words" error={errs.display_name} />
      <View style={{ flexDirection: tv ? 'row' : 'column', gap: tv ? u * 0.75 : 0 }}>
        <View style={{ flex: 1 }}><Field label="Age" required value={age} onChangeText={setAge} keyboardType="number-pad" tvKeyboard="numeric" error={errs.age} /></View>
        <View style={{ flex: 1 }}><Field label="Weight (kg)" required value={weight} onChangeText={setWeight} keyboardType="decimal-pad" tvKeyboard="numeric" error={errs.weight_kg} /></View>
      </View>
      {pickCoach ? (
        <View style={{ gap: u * 0.375, marginBottom: u * 0.75 }}>
          <X s={0.85} c={C.sub}>Coach <X s={0.85} c={C.danger}>*</X></X>
          <Select label="Coach" value={coach} onChange={setCoach} options={[{ value: '', label: 'Choose a Coach' }, ...copts]} />
          {errs.coach_id ? <X s={0.8} c={C.danger}>{errs.coach_id}</X> : null}
        </View>
      ) : null}
      {pickHub ? (
        <View style={{ gap: u * 0.375, marginBottom: u * 0.75 }}>
          <X s={0.85} c={C.sub}>Hub <X s={0.8} c={C.faint}>(defaults to the coach's hub)</X></X>
          <Select label="Hub" value={hub} onChange={setHub} options={[{ value: '', label: 'Same as the coach' }, ...hopts]} />
        </View>
      ) : null}
      <Button full label="Create player" loading={act.busy === 'create'} onPress={create} />
    </Card>
  );
}

function Roster({ list, total, sel, setSel }: { list: PlayerListItem[]; total: number; sel: string | null; setSel: (id: string) => void }) {
  const { u } = useDevice();
  const q = useSearch((s) => s.q);
  const setQ = useSearch((s) => s.set);
  return (
    <Card>
      <CardH em={`${list.length} of ${total}`}>Roster</CardH>
      <View style={[{ flexDirection: 'row', alignItems: 'center', minHeight: u * 3.2, borderRadius: u, paddingHorizontal: u, gap: u * 0.5 }, glassLo(), neoIn(u)]}>
        <TextInput value={q} onChangeText={setQ} placeholder="Search all players by name or NB-code" placeholderTextColor={C.faint} accessibilityLabel="Search players" style={{ flex: 1, minWidth: 0, color: C.text, fontFamily: 'Manrope_600SemiBold', fontSize: u, padding: 0, outlineStyle: 'none' } as never} />
      </View>
      <View style={{ marginTop: u * 0.75, gap: u * 0.5 }}>
        {list.length ? list.map((x) => {
          const on = x.id === sel;
          return (
            <Pressable key={x.id} onPress={() => setSel(x.id)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.75, overflow: 'hidden', opacity: x.status === 'inactive' ? 0.55 : 1 }, on ? null : glassLo()]}>
              {on ? <SoftSelected /> : null}
              <Avatar name={x.display_name} size={u * 2.75} fs={0.85 * 15} photoKey={x.player_code} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={1} w="b" numberOfLines={1}>{x.display_name}</X>
                <X s={0.8} c={C.sub} numberOfLines={1}>{x.player_code}{x.status === 'inactive' ? ' · Inactive' : ''}{x.pin_reset_requested ? ' · PIN reset requested' : ''}</X>
              </View>
              <X s={1} w="b" num>{x.perf.accuracy === null ? '--' : `${Math.round(x.perf.accuracy * 10) / 10}%`}</X>
            </Pressable>
          );
        }) : <Empty>No players match.</Empty>}
      </View>
    </Card>
  );
}

function Training({ p, perm }: { p: PlayerDetail; perm: { access: boolean; progress: boolean; programs: boolean } }) {
  const { u } = useDevice();
  const act = useAction(['/players', '/programs']);
  const programs = useGet<{ items: ProgramDTO[] }>('/programs');
  const usable = (programs.data?.items ?? []).filter((x) => !x.retired && x.stages.length > 0);
  const as = p.program;
  const popts = [...(as ? [] : [{ value: '', label: 'No program' }]), ...usable.map((x) => ({ value: x.id, label: x.name }))];
  if (as && !usable.some((x) => x.id === as.program.id)) popts.unshift({ value: as.program.id, label: as.program.name });
  const items = GAME_SLUGS.map((s) => p.access.find((a) => a.game === s)).filter((a): a is AccessItem => !!a);

  return (
    <Card>
      <CardH em="program and games">Training</CardH>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.75 }}>
        <View style={{ flex: 1, minWidth: u * 10 }}>
          <Select label="Program" value={as?.program.id ?? ''} options={popts} disabled={!perm.programs} onChange={(v) => v && v !== as?.program.id && void act.run('prog', () => api.put(`/players/${p.id}/program`, { program_id: v }), 'Program changed.')} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5 }}>
          <Button size="sm" variant="secondary" label="Step back" disabled={!perm.progress || !as} onPress={() => (!as || as.current_stage <= 1 ? toast('Already at stage 1.') : void act.run('stage', () => api.put(`/players/${p.id}/program/stage`, { stage: as.current_stage - 1 })))} />
          <X s={1} w="b" num>Stage {as?.current_stage ?? '--'}</X>
          <Button size="sm" variant="secondary" label="Advance" disabled={!perm.progress || !as} onPress={() => (!as || as.current_stage >= as.stage_count ? toast('Already at the last stage.') : void act.run('adv', () => api.post(`/players/${p.id}/program/advance`, {})))} />
        </View>
      </View>
      <View style={{ marginTop: u * 0.75, gap: u * 0.5 }}>
        {items.map((a) => {
          const info = GAMES[a.game];
          const open = a.state !== 'locked';
          const cap = a.level_cap ?? info.maxLevel;
          const lv = Array.from({ length: info.maxLevel - info.minLevel + 1 }, (_, j) => ({ value: String(info.minLevel + j), label: `L${info.minLevel + j}` }));
          return (
            <View key={a.game} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625 }, glassLo()]}>
              <X s={1} w="b" style={{ flex: 1 }} numberOfLines={1}>{info.name}</X>
              <Pressable accessibilityRole="button" accessibilityLabel={`${info.name} ${open ? 'open' : 'locked'}`} disabled={!perm.access && !perm.progress} onPress={() => void act.run('acc' + a.game, () => api.put(`/players/${p.id}/access/${a.game}`, { state: open ? 'locked' : 'unlocked' }), open ? `${info.name} locked` : `${info.name} unlocked`)} style={{ borderRadius: 999, paddingHorizontal: u * 0.75, paddingVertical: u * 0.25, backgroundColor: open ? 'rgba(39,229,181,.12)' : C.tint }}>
                <X s={0.72} w="b" c={open ? C.success : C.faint}>{open ? 'Open' : 'Locked'}</X>
              </Pressable>
              <Select label={`Level cap ${info.name}`} w={u * 5.4} h={u * 2.5} value={String(cap)} options={lv} disabled={!perm.access} onChange={(v) => void act.run('cap' + a.game, () => api.put(`/players/${p.id}/access/${a.game}`, { level_cap: +v >= info.maxLevel ? null : +v }), 'Level cap saved.')} />
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Profile({ p, canManage, onChanged }: { p: PlayerDetail; canManage: boolean; onChanged: () => void }) {
  const { u } = useDevice();
  const router = useRouter();
  const setPhoto = usePhotos((s) => s.set);
  const act = useAction(['/players', '/programs']);
  const [deact, setDeact] = useState(false);
  const active = p.status === 'active';
  const perf = useGet<PerformanceResponse>(`/players/${p.id}/performance`);
  const best = useMemo(() => { const v = (perf.data?.trend ?? []).map((x) => x.best_rt).filter((x): x is number => x !== null); return v.length ? Math.min(...v) : null; }, [perf.data]);
  const s = p.perf;

  async function reset() {
    const r = await act.run('reset', () => api.post<ResetPlayerResponse>(`/players/${p.id}/reset-credentials`, {}));
    if (!r.ok) return;
    useCredentials.getState().show({ kind: 'player', name: p.display_name, loginId: r.value.credentials.login_id, secret: r.value.credentials.pin, secretLabel: 'PIN', note: 'The old PIN no longer works. The new PIN is not shown again.', back: '/players' });
    router.push('/players/credentials' as never);
  }

  return (
    <Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: u }}>
        <Avatar name={p.display_name} size={u * 5} fs={1.1 * 15 * 1.4} photoKey={p.player_code} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <X s={1.25} w="b" numberOfLines={2}>{p.display_name}</X>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5, marginTop: u * 0.25 }}>
            <Pill>{p.player_code}</Pill>
            <Pill t={active ? 'good' : 'off'}>{active ? 'Active' : 'Inactive'}</Pill>
            {p.hub ? <Pill>{p.hub.name}</Pill> : null}
          </View>
        </View>
      </View>
      <View style={{ marginTop: u * 0.75 }}>
        <Facts items={[['Age', p.age ?? '--'], ['Weight', p.weight_kg === null ? '--' : `${p.weight_kg} kg`], ['Hits', s.hits], ['Misses', s.misses], ['Accuracy', s.accuracy === null ? '--' : `${Math.round(s.accuracy * 10) / 10}%`], ['Best', best === null ? '--' : `${best} ms`]]} />
      </View>
      <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
        <Button size="sm" variant="secondary" label="Change photo" onPress={async () => { const d = await pickPhoto(); if (d) { setPhoto(p.player_code, d); toast('Photo updated on this device.', 'success'); } }} />
        {canManage ? <Button size="sm" variant={p.pin_reset_requested ? 'primary' : 'secondary'} label={p.pin_reset_requested ? 'Issue new PIN' : 'Reset PIN'} loading={act.busy === 'reset'} onPress={reset} /> : null}
      </View>
      {canManage ? (
        <View style={{ marginTop: u * 0.75 }}>
          {active ? (
            deact ? (
              <DeactForm busy={act.busy === 'status'} onDone={() => setDeact(false)} onSubmit={async (reason) => { const r = await act.run('status', () => api.patch(`/players/${p.id}`, { status: 'inactive', reason }), 'Marked inactive.'); if (r.ok) { setDeact(false); onChanged(); } }} />
            ) : (
              <Button size="sm" variant="danger" label="Mark inactive" onPress={() => setDeact(true)} />
            )
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5 }}>
              <X s={0.88} c={C.sub} style={{ flexShrink: 1 }}>Reason: {p.inactive_reason ?? '--'}</X>
              <Button size="sm" variant="secondary" label="Reactivate" loading={act.busy === 'status'} onPress={async () => { const r = await act.run('status', () => api.patch(`/players/${p.id}`, { status: 'active' }), 'Reactivated.'); if (r.ok) onChanged(); }} />
            </View>
          )}
        </View>
      ) : null}
    </Card>
  );
}

function PlayersScreen() {
  const { u, tv, wide } = useDevice();
  const router = useRouter();
  const user = useAuth((s) => s.user)!;
  const can = useCan();
  const q = useSearch((s) => s.q);
  const presetHub = usePresetHub((s) => s.id);
  const [newP, setNewP] = useState(!!presetHub);
  const preset = useSelPlayer((s) => s.id);
  const setPreset = useSelPlayer((s) => s.set);
  const [sel, setSel] = useState<string | null>(preset);
  const roster = useGet<Page<PlayerListItem>>('/players', { limit: 200 });
  const all = roster.data?.items ?? [];
  const needle = q.trim().toLowerCase();
  const list = all.filter((x) => !needle || x.display_name.toLowerCase().includes(needle) || x.player_code.toLowerCase().includes(needle));
  const cur = sel && all.some((x) => x.id === sel) ? sel : (list[0]?.id ?? all[0]?.id ?? null);
  useEffect(() => { if (preset) setPreset(null); }, [preset, setPreset]);
  const detail = useGet<PlayerDetail>(cur ? `/players/${cur}` : null);
  const perf = useGet<PerformanceResponse>(cur ? `/players/${cur}/performance` : null);
  const wk = useMemo(() => weekly(perf.data), [perf.data]);
  const p = detail.data && detail.data.id === cur ? detail.data : null;
  const canManage = can('MANAGE_PLAYERS');
  const perm = { access: can('MANAGE_GAME_ACCESS'), progress: can('MANAGE_GAME_PROGRESS'), programs: can('MANAGE_PROGRAMS') };

  const left = (
    <>
      <Roster list={list} total={all.length} sel={cur} setSel={setSel} />
      {p ? <Training p={p} perm={perm} /> : null}
    </>
  );
  const chart = (
    <Card>
      <CardH em={wk?.em ?? '8 weeks'}>Performance</CardH>
      {wk ? <WeekChart labels={wk.labels} series={wk.series} height={u * (wide ? 15 : 14)} revealKey={`${cur}${perf.dataUpdatedAt}`} /> : <Empty>{perf.isLoading ? 'Loading.' : 'No completed rounds yet.'}</Empty>}
    </Card>
  );
  const history = p ? <HistoryTable key={p.id} playerId={p.id} games={p.perf.sessions} accuracy={p.perf.accuracy} /> : null;
  const showInsights = user.role !== 'SUPER_ADMIN' && user.role !== 'ADMIN';
  const insights = (
    <Card>
      <CardH>Performance Insights &amp; Improvement Plan</CardH>
      {perf.data ? <InsightsPanel bare result={perf.data.insights} empty={`${p?.display_name ?? 'This player'} has no completed rounds yet. A plan appears after the first round.`} /> : <LoadingBlock label="Loading insights" />}
    </Card>
  );

  return (
    <View style={{ gap: 0 }}>
      <Header eyebrow={`${ROLE[user.role] ?? user.role} · all players`} title="Players" subtitle="Search, view, create and edit any player." right={canManage ? <Button label="New player" onPress={() => setNewP(!newP)} /> : undefined} />
      <View style={{ height: u * 0.75 }} />
      {newP ? <NewPlayerCard onCreated={(id) => { setSel(id); setNewP(false); usePresetHub.getState().set(null); }} /> : null}
      {roster.isLoading ? (
        <LoadingBlock label="Loading players" />
      ) : wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: u }}>
          <View style={{ flex: 1, minWidth: 0, gap: u }}>{left}</View>
          <View style={{ flex: 1.35, minWidth: 0, gap: u }}>
            {p ? <Profile key={p.id} p={p} canManage={canManage} onChanged={() => void detail.refetch()} /> : detail.isLoading ? <LoadingBlock label="Loading player" /> : null}
            {chart}
          </View>
        </View>
      ) : (
        <View style={{ gap: u }}>
          <Roster list={list} total={all.length} sel={cur} setSel={setSel} />
          {p ? <Profile key={p.id} p={p} canManage={canManage} onChanged={() => void detail.refetch()} /> : detail.isLoading ? <LoadingBlock label="Loading player" /> : null}
          {p ? <Training p={p} perm={perm} /> : null}
          {chart}
          {history}
          {showInsights ? insights : null}
        </View>
      )}
      {wide && !roster.isLoading && p ? (
        showInsights ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: u, marginTop: u }}>
            <View style={{ flex: 1.5, minWidth: 0 }}>{history}</View>
            <View style={{ flex: 1, minWidth: 0 }}>{insights}</View>
          </View>
        ) : (
          <View style={{ marginTop: u }}>{history}</View>
        )
      ) : null}
      <View style={{ height: u * 0.01 }}>{tv ? null : null}</View>
    </View>
  );
}

export default function PlayersIndex() {
  return (
    <RequirePermission any={['MANAGE_PLAYERS', 'VIEW_RESULTS']}>
      <Screen testID="screen-players" maxWidth={100000}>
        <PlayersScreen />
      </Screen>
    </RequirePermission>
  );
}