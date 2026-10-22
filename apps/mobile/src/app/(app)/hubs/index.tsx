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

function Compare({ days }: { days: number }) {
  const { u } = useDevice();
  const cmp = useGet<{ days: number; items: HubCompareRow[] }>('/hubs/compare', { days });
  const rows = cmp.data?.items ?? [];
  const metrics: { k: string; get: (r: HubCompareRow) => string; num: (r: HubCompareRow) => number | null; good: 'high' | 'low' }[] = [
    { k: 'Players (active)', get: (r) => `${r.players_active} / ${r.players}`, num: (r) => r.players_active, good: 'high' },
    { k: 'Coach attendance', get: (r) => pct(r.coach_attendance_pct), num: (r) => r.coach_attendance_pct, good: 'high' },
    { k: 'Player attendance', get: (r) => pct(r.player_attendance_pct), num: (r) => r.player_attendance_pct, good: 'high' },
    { k: 'Rounds played', get: (r) => String(r.rounds), num: (r) => r.rounds, good: 'high' },
    { k: 'Accuracy', get: (r) => pct(r.accuracy), num: (r) => r.accuracy, good: 'high' },
    { k: 'Avg reaction', get: (r) => (r.avg_rt === null ? '--' : `${r.avg_rt} ms`), num: (r) => r.avg_rt, good: 'low' },
  ];
  return (
    <Card>
      <CardH em={`last ${days} days`}>Compare hubs</CardH>
      {cmp.isLoading ? <LoadingBlock label="Comparing" /> : rows.length < 2 ? <Empty>Create a second hub to compare.</Empty> : (
        <View style={{ gap: u * 0.375 }}>
          <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
            <View style={{ flex: 1.1 }} />
            {rows.map((r) => <X key={r.hub.id} s={0.78} w="b" style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{r.hub.name}</X>)}
          </View>
          {metrics.map((m) => {
            const vals = rows.map(m.num).filter((v): v is number => v !== null);
            const best = vals.length > 1 ? (m.good === 'high' ? Math.max(...vals) : Math.min(...vals)) : null;
            return (
              <View key={m.k} style={{ flexDirection: 'row', gap: u * 0.5, alignItems: 'center', paddingVertical: u * 0.375, borderTopWidth: 1, borderTopColor: C.border }}>
                <X s={0.82} c={C.sub} style={{ flex: 1.1 }}>{m.k}</X>
                {rows.map((r) => {
                  const v = m.num(r);
                  const win = best !== null && v === best && new Set(vals).size > 1;
                  return <X key={r.hub.id} s={0.9} w={win ? 'x' : 'm'} num c={win ? C.success : C.text} style={{ flex: 1, textAlign: 'right' }}>{m.get(r)}</X>;
                })}
              </View>
            );
          })}
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
  const items = hubs.data?.items ?? [];
  return (
    <View>
      <Header eyebrow="Super Admin and Admin" title="Hubs" subtitle="Training locations. Each coach and player belongs to one hub." right={<Button label="New hub" onPress={() => setAdding(!adding)} />} />
      <View style={{ height: u * 0.75 }} />
      {adding ? <NewHub onDone={() => setAdding(false)} /> : null}
      {hubs.isLoading ? <LoadingBlock label="Loading hubs" /> : hubs.isError ? <ErrorBlock error={hubs.error} onRetry={() => void hubs.refetch()} /> : items.length === 0 ? (
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