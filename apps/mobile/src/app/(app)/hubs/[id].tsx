// One hub: players active and inactive, coach and player attendance, the people with their attendance and accuracy,
// and where the attendance came from (automatic now; NFC or biometric check-ins later).

import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { HubDTO, HubPerson, HubSummary, Page, PlayerListItem, UserDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { glassLo } from '../../../theme/surfaces';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { fmtDateTime } from '../../../lib/format';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Card } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { CardH, Empty, Facts, Pill, Seg, X } from '../../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { useAction } from '../../../staff/players-common';
import { usePresetHub, useSelPlayer } from '../../../state/shell';

const pct = (v: number | null) => (v === null ? '--' : `${Math.round(v)}%`);
const SOURCE: Record<string, string> = { auto: 'Automatic', nfc: 'NFC tap', biometric: 'Biometric', manual: 'Marked by hand' };

function People({ title, rows, onOpen }: { title: string; rows: HubPerson[]; onOpen?: (id: string) => void }) {
  const { u } = useDevice();
  return (
    <Card>
      <CardH em={`${rows.filter((r) => r.active).length} active of ${rows.length}`}>{title}</CardH>
      {rows.length === 0 ? <Empty>No one here yet.</Empty> : (
        <View style={{ gap: u * 0.5 }}>
          {rows.map((r) => (
            <Pressable key={r.id} disabled={!onOpen} onPress={() => onOpen?.(r.id)} accessibilityRole={onOpen ? 'button' : undefined} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625, opacity: r.active ? 1 : 0.55 }, glassLo()]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={0.95} w="b" numberOfLines={1}>{r.name}{r.code ? <X s={0.78} c={C.faint}>  {r.code}</X> : null}{r.active ? '' : '  · Inactive'}</X>
                <X s={0.78} c={C.sub} numberOfLines={1}>{r.last_seen ? `Last seen ${fmtDateTime(r.last_seen)}` : 'Not seen in this period'}</X>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <X s={0.95} w="x" num>{pct(r.attendance_pct)}</X>
                <X s={0.7} c={C.faint}>{r.days_present} {r.days_present === 1 ? 'day' : 'days'}</X>
              </View>
              {r.role === 'PLAYER' ? (
                <View style={{ alignItems: 'flex-end', minWidth: u * 3.5 }}>
                  <X s={0.95} w="b" num>{pct(r.accuracy)}</X>
                  <X s={0.7} c={C.faint}>{r.rounds} {r.rounds === 1 ? 'round' : 'rounds'}</X>
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}

function Attendance({ s }: { s: HubSummary }) {
  const { u } = useDevice();
  const max = Math.max(1, ...s.series.map((d) => d.coaches + d.players));
  const h = u * 6;
  return (
    <Card>
      <CardH em="people present per day">Attendance</CardH>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: h }}>
        {s.series.map((d) => {
          const t = d.coaches + d.players;
          return (
            <View key={d.day} style={{ flex: 1, height: h, justifyContent: 'flex-end' }} accessibilityLabel={`${d.day}: ${d.players} players, ${d.coaches} coaches`}>
              <View style={{ height: Math.max(t ? 3 : 1, (t / max) * h), borderRadius: 3, overflow: 'hidden', backgroundColor: t ? C.primary : C.tint }}>
                <View style={{ height: `${t ? (d.coaches / t) * 100 : 0}%`, backgroundColor: C.cyan }} />
              </View>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: u, marginTop: u * 0.5, flexWrap: 'wrap' }}>
        <X s={0.75} c={C.faint}><X s={0.75} c={C.primary}>■</X> Players   <X s={0.75} c={C.cyan}>■</X> Coaches</X>
        <X s={0.75} c={C.faint}>Source: {Object.keys(s.sources).length ? Object.entries(s.sources).map(([k, n]) => `${SOURCE[k] ?? k} (${n})`).join(', ') : 'none yet'}</X>
      </View>
    </Card>
  );
}

function Edit({ hub, onDone }: { hub: HubDTO; onDone: () => void }) {
  const { u } = useDevice();
  const [name, setName] = useState(hub.name);
  const [city, setCity] = useState(hub.city ?? '');
  const act = useAction(['/hubs']);
  return (
    <Card style={{ marginBottom: u }}>
      <CardH>Edit hub</CardH>
      <Field label="Hub name" required value={name} onChangeText={setName} maxLength={80} error={act.fields.name} autoCapitalize="words" />
      <Field label="City" value={city} onChangeText={setCity} maxLength={60} autoCapitalize="words" />
      <View style={{ flexDirection: 'row', gap: u * 0.5, flexWrap: 'wrap' }}>
        <Button size="sm" label="Save" loading={act.busy === 'save'} onPress={async () => { const r = await act.run('save', () => api.patch(`/hubs/${hub.id}`, { name: name.trim(), city: city.trim() || null }), 'Saved.'); if (r.ok) onDone(); }} />
        <Button size="sm" variant="secondary" label={hub.is_active ? 'Close this hub' : 'Reopen this hub'} loading={act.busy === 'active'} onPress={async () => { const r = await act.run('active', () => api.patch(`/hubs/${hub.id}`, { is_active: !hub.is_active }), hub.is_active ? 'Hub closed.' : 'Hub reopened.'); if (r.ok) onDone(); }} />
        <Button size="sm" variant="ghost" label="Cancel" onPress={onDone} />
      </View>
    </Card>
  );
}

/** Put people in this hub: pick existing coaches and players (they move here from any other hub), or start a new one with this hub preselected. */
function AddPeople({ hub, onChanged }: { hub: HubDTO; onChanged: () => void }) {
  const { u } = useDevice();
  const router = useRouter();
  const [open, setOpen] = useState<null | 'COACH' | 'PLAYER'>(null);
  const [q, setQ] = useState('');
  const act = useAction(['/hubs', '/players', '/users']);
  const players = useGet<Page<PlayerListItem>>('/players', { limit: 200 }, { enabled: open === 'PLAYER' });
  const coaches = useGet<Page<UserDTO>>('/users', { role: 'COACH', active: '1', limit: 100 }, { enabled: open === 'COACH' });
  const rows = (open === 'PLAYER'
    ? (players.data?.items ?? []).map((p) => ({ id: p.id, name: p.display_name, sub: p.player_code, hub: p.hub ?? null }))
    : (coaches.data?.items ?? []).map((c) => ({ id: c.id, name: c.display_name, sub: c.login_id, hub: c.hub ?? null }))
  ).filter((r) => r.hub?.id !== hub.id && (!q || r.name.toLowerCase().includes(q.toLowerCase()) || r.sub.toLowerCase().includes(q.toLowerCase())));
  const add = async (rid: string) => {
    const r = await act.run('add' + rid, () => api.patch(open === 'PLAYER' ? `/players/${rid}` : `/users/${rid}`, { hub_id: hub.id }), `Added to ${hub.name}.`);
    if (r.ok) onChanged();
  };
  const startNew = (kind: 'PLAYER' | 'COACH') => { usePresetHub.getState().set(hub.id); router.push((kind === 'PLAYER' ? '/players' : '/coaches') as never); };
  return (
    <Card>
      <CardH>Add people to this hub</CardH>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
        <Button size="sm" variant="secondary" label="Add existing player" onPress={() => { setOpen(open === 'PLAYER' ? null : 'PLAYER'); setQ(''); }} />
        <Button size="sm" variant="secondary" label="Add existing coach" onPress={() => { setOpen(open === 'COACH' ? null : 'COACH'); setQ(''); }} />
        <Button size="sm" label="New player" onPress={() => startNew('PLAYER')} />
        <Button size="sm" label="New coach" onPress={() => startNew('COACH')} />
      </View>
      {open ? (
        <View style={{ marginTop: u * 0.75, gap: u * 0.5 }}>
          <Field label={open === 'PLAYER' ? 'Search players' : 'Search coaches'} value={q} onChangeText={setQ} />
          {rows.length === 0 ? <Empty>{players.isLoading || coaches.isLoading ? 'Loading.' : 'No one else to add.'}</Empty> : rows.slice(0, 40).map((r) => (
            <View key={r.id} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.5 }, glassLo()]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <X s={0.95} w="b" numberOfLines={1}>{r.name}</X>
                <X s={0.75} c={C.sub} numberOfLines={1}>{r.sub} · {r.hub ? `now in ${r.hub.name}` : 'no hub yet'}</X>
              </View>
              <Button size="sm" label="Add" loading={act.busy === 'add' + r.id} onPress={() => void add(r.id)} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function HubDetail({ id }: { id: string }) {
  const { u, wide } = useDevice();
  const router = useRouter();
  const setSel = useSelPlayer((s) => s.set);
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const [edit, setEdit] = useState(false);
  const act = useAction(['/hubs', '/players', '/users']);
  const q = useGet<HubSummary>(`/hubs/${id}/summary`, { days });
  const s = q.data;
  return (
    <View>
      <Header back="/hubs" backLabel="All hubs" eyebrow="Hub" title={s?.hub.name ?? 'Hub'} subtitle={s?.hub.city ?? undefined} right={s ? <Button size="sm" variant="secondary" label="Edit" onPress={() => setEdit(!edit)} /> : undefined} />
      <View style={{ height: u * 0.75 }} />
      {edit && s ? <Edit hub={s.hub} onDone={() => { setEdit(false); void q.refetch(); }} /> : null}
      {q.isLoading ? <LoadingBlock label="Loading hub" /> : q.isError || !s ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : (
        <View style={{ gap: u }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: u * 0.5 }}>
            <Seg<7 | 14 | 30> items={[[7, '7 days'], [14, '14 days'], [30, '30 days']]} value={days} onChange={setDays} />
            <Pill t={s.hub.is_active ? 'good' : 'off'}>{s.hub.is_active ? 'Active hub' : 'Closed hub'}</Pill>
          </View>
          <Card>
            <CardH em={`last ${days} days`}>At a glance</CardH>
            <Facts items={[['Active players', s.players_active], ['Inactive players', s.players_inactive], ['Coaches', s.coaches.length], ['Coach attendance', pct(s.coach_attendance_pct)], ['Player attendance', pct(s.player_attendance_pct)], ['Rounds', s.rounds], ['Accuracy', pct(s.accuracy)], ['Avg reaction', s.avg_rt === null ? '--' : `${s.avg_rt} ms`]]} />
          </Card>
          <AddPeople hub={s.hub} onChanged={() => void q.refetch()} />
          <Attendance s={s} />
          <View style={wide ? { flexDirection: 'row', alignItems: 'flex-start', gap: u } : { gap: u }}>
            <View style={{ flex: 1, minWidth: 0 }}><People title="Coaches" rows={s.coaches} /></View>
            <View style={{ flex: 1, minWidth: 0 }}><People title="Players" rows={s.players} onOpen={(pid) => { setSel(pid); router.push('/players' as never); }} /></View>
          </View>
          <Card>
            <CardH>People without a hub</CardH>
            <X s={0.88} c={C.sub} style={{ marginBottom: u * 0.5 }}>Accounts made before hubs existed have none. Put all of them in this hub with one tap.</X>
            <Button size="sm" variant="secondary" label={`Add everyone without a hub to ${s.hub.name}`} loading={act.busy === 'assign'} onPress={async () => { const r = await act.run('assign', () => api.post<{ assigned: number }>(`/hubs/${id}/assign-unassigned`, {})); if (r.ok) { void q.refetch(); } }} />
          </Card>
        </View>
      )}
    </View>
  );
}

export default function HubPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <RequirePermission any={['MANAGE_HUBS']}>
      <Screen testID="screen-hub" maxWidth={100000}>
        <HubDetail id={String(id)} />
      </Screen>
    </RequirePermission>
  );
}