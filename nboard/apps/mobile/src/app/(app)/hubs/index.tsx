// Hubs: the training locations (for example Kredo Center – Bellandur). Super Admin and Admin create them; each coach and player
// belongs to one. Tap a hub for its players, attendance and results, or compare all hubs side by side.

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { HubCompareRow, HubDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Card } from '../../../ui/Card';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { CityPick } from '../../../ui/CityPick';
import { CardH, Empty, Pill, Seg, X } from '../../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Icon } from '../../../ui/Icon';
import { useAction } from '../../../staff/players-common';

const pct = (v: number | null) => (v === null ? '--' : `${Math.round(v)}%`);

function NewHub({ onDone }: { onDone: () => void }) {
  const { u } = useDevice();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const act = useAction(['/hubs']);
  async function save() {
    if (name.trim().length < 2) return setErr({ name: 'Give the hub a name.' });
    const r = await act.run('new', () => api.post<HubDTO>('/hubs', { name: name.trim(), city: city.trim() || null }), 'Hub created.');
    if (!r.ok) return;
    onDone();
  }
  return (
    <Card style={{ marginBottom: u }}>
      <CardH em="name is required">New hub</CardH>
      <Field label="Hub name" required value={name} onChangeText={(t) => { setName(t); setErr({}); }} placeholder="Kredo Center – Bellandur" error={err.name} autoCapitalize="words" maxLength={80} />
      <CityPick value={city} onChange={setCity} />
      <Button full label="Create hub" loading={act.busy === 'new'} onPress={save} />
    </Card>
  );
}

type Metric = 'rounds' | 'accuracy' | 'player_att' | 'rt';
const SORTS: [Metric, string][] = [['rounds', 'Rounds'], ['accuracy', 'Accuracy'], ['player_att', 'Attendance'], ['rt', 'Reaction']];

/** Compare hubs: one row per hub, ranked by the measure you pick. A row's width never depends on how many hubs there are, so ten or
 *  a hundred hubs read the same as three; the first few show and the rest open with one tap. */
function Compare({ days }: { days: number }) {
  const { u } = useDevice();
  const cmp = useGet<{ days: number; items: HubCompareRow[] }>('/hubs/compare', { days });
  const [sort, setSort] = useState<Metric>('rounds');
  const [all, setAll] = useState(false);
  const rows = cmp.data?.items ?? [];
  const val = (r: HubCompareRow): number | null => (sort === 'rounds' ? r.rounds : sort === 'accuracy' ? r.accuracy : sort === 'player_att' ? r.player_attendance_pct : r.avg_rt);
  const ranked = [...rows].sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === null && y === null) return a.hub.name.localeCompare(b.hub.name);
    if (x === null) return 1;
    if (y === null) return -1;
    return sort === 'rt' ? x - y : y - x;
  });
  const top = Math.max(1, ...ranked.map((r) => (sort === 'rt' ? 0 : val(r) ?? 0)));
  const shown = all ? ranked : ranked.slice(0, 6);
  return (
    <Card>
      <CardH em={`last ${days} days`}>Compare hubs</CardH>
      {cmp.isLoading ? <LoadingBlock label="Comparing" /> : rows.length < 2 ? <Empty>Create a second hub to compare.</Empty> : (
        <View style={{ gap: u * 0.5 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.5, flexWrap: 'wrap' }}>
            <X s={0.78} c={C.faint}>Rank by</X>
            <Seg<Metric> items={SORTS} value={sort} onChange={setSort} />
          </View>
          {shown.map((r, i) => {
            const v = val(r);
            const frac = v === null ? 0 : sort === 'rt' ? Math.min(1, Math.max(0.08, 1 - (v - 200) / 600)) : Math.min(1, v / top);
            return (
              <View key={r.hub.id} style={{ paddingVertical: u * 0.5, borderTopWidth: 1, borderTopColor: C.border, gap: u * 0.3 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.6 }}>
                  <X s={0.85} w="x" num c={i === 0 ? C.highlight : C.faint} style={{ width: u * 1.4 }}>{i + 1}</X>
                  <X s={0.95} w="b" style={{ flex: 1, minWidth: 0 }} numberOfLines={1}>{r.hub.name}</X>
                  <X s={0.95} w="x" num>{sort === 'rounds' ? String(r.rounds) : sort === 'accuracy' ? pct(r.accuracy) : sort === 'player_att' ? pct(r.player_attendance_pct) : r.avg_rt === null ? '--' : `${r.avg_rt} ms`}</X>
                </View>
                <View style={{ height: u * 0.4, borderRadius: u * 0.2, backgroundColor: C.tint, overflow: 'hidden', marginLeft: u * 2 }}>
                  <View style={{ width: `${Math.round(frac * 100)}%`, height: '100%', backgroundColor: i === 0 ? C.highlight : C.primary, borderRadius: u * 0.2 }} />
                </View>
                <X s={0.75} c={C.faint} style={{ marginLeft: u * 2 }}>
                  {r.players_active}/{r.players} active · coaches {pct(r.coach_attendance_pct)} · players {pct(r.player_attendance_pct)} · accuracy {pct(r.accuracy)} · {r.avg_rt === null ? '--' : `${r.avg_rt} ms`}
                </X>
              </View>
            );
          })}
          {ranked.length > 6 ? <Button size="sm" variant="ghost" label={all ? 'Show fewer' : `Show all ${ranked.length} hubs`} onPress={() => setAll(!all)} /> : null}
        </View>
      )}
    </Card>
  );
}

function HubsScreen() {
  const { u, wide } = useDevice();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [days, setDays] = useState<7 | 14 | 30>(30);
  const hubs = useGet<{ items: HubDTO[] }>('/hubs');
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const all = hubs.data?.items ?? [];
  const found = all.filter((h) => !q || h.name.toLowerCase().includes(q.toLowerCase()) || (h.city ?? '').toLowerCase().includes(q.toLowerCase()));
  const items = more || q ? found : found.slice(0, 12);
  return (
    <View>
      <Header title="Hubs" right={<Button label="New hub" onPress={() => setAdding(!adding)} />} />
      <View style={{ height: u * 0.75 }} />
      {adding ? <NewHub onDone={() => setAdding(false)} /> : null}
      {all.length > 8 ? <View style={{ maxWidth: u * 30, marginBottom: u * 0.5 }}><Field label="Search hubs" value={q} onChangeText={setQ} placeholder="Name or city" /></View> : null}
      {hubs.isLoading ? <LoadingBlock label="Loading hubs" /> : hubs.isError ? <ErrorBlock error={hubs.error} onRetry={() => void hubs.refetch()} /> : all.length === 0 ? (
        <Empty>No hubs yet. Create the first one, then give coaches and players a hub.</Empty>
      ) : (
        <View style={{ gap: u }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
            {items.map((h) => (
              <View key={h.id} style={{ width: wide ? '49.2%' : '100%', flexGrow: wide ? 0 : 1, minWidth: 0 }}>
                <Card onPress={() => router.push(`/hubs/${h.id}` as never)} accessibilityLabel={`Open ${h.name}`}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75 }}>
                    <View style={{ width: u * 2.75, height: u * 2.75, borderRadius: u, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primaryDim }}>
                      <Icon name="hubs" size={u * 1.4} color={C.highlight} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <X s={1.05} w="b" numberOfLines={2}>{h.name}</X>
                      <X s={0.8} c={C.sub}>{h.city ?? 'No city'}</X>
                    </View>
                    <Pill t={h.is_active ? 'good' : 'off'}>{h.is_active ? 'Active' : 'Closed'}</Pill>
                  </View>
                  <View style={{ flexDirection: 'row', gap: u * 1.5, marginTop: u * 0.75 }}>
                    <View><X s={1.3} w="x" num>{h.coaches}</X><X s={0.75} c={C.faint}>Coaches</X></View>
                    <View><X s={1.3} w="x" num>{h.active_players}</X><X s={0.75} c={C.faint}>Active players</X></View>
                    <View><X s={1.3} w="x" num>{Math.max(0, h.players - h.active_players)}</X><X s={0.75} c={C.faint}>Inactive</X></View>
                  </View>
                </Card>
              </View>
            ))}
          </View>
          {!q && found.length > 12 ? <Button size="sm" variant="ghost" label={more ? 'Show fewer hubs' : `Show all ${found.length} hubs`} onPress={() => setMore(!more)} /> : null}
          <View style={{ alignSelf: 'flex-start' }}><Seg<7 | 14 | 30> items={[[7, '7 days'], [14, '14 days'], [30, '30 days']]} value={days} onChange={setDays} /></View>
          <Compare days={days} />
        </View>
      )}
    </View>
  );
}

export default function Hubs() {
  return (
    <RequirePermission any={['MANAGE_HUBS']}>
      <Screen testID="screen-hubs" maxWidth={100000}>
        <HubsScreen />
      </Screen>
    </RequirePermission>
  );
}
