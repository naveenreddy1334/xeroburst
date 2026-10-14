// Programs, as in the design: a head with "New program", an inline name form, and one card per program with its stages and Retire / Restore.
// The full editor (stage labels, games per stage, order, delete) stays one tap away under "Edit stages".

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { GAMES } from '@nboard/shared';
import type { ProgramDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { glassLo } from '../../../theme/surfaces';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { useCan } from '../../../state/auth';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Field } from '../../../ui/Field';
import { Empty, Pill, X } from '../../../ui/Bits';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { useAction } from '../../../staff/players-common';

function ProgramCard({ p, canEdit }: { p: ProgramDTO; canEdit: boolean }) {
  const { u } = useDevice();
  const router = useRouter();
  const { run, busy } = useAction(['/programs', '/players']);
  const flip = () => void run('retire', () => api.patch<ProgramDTO>(`/programs/${p.id}`, { retired: !p.retired }), p.retired ? 'Program restored.' : 'Program retired.');
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: u * 0.5 }}>
        <X s={1.1} w="b" style={{ flex: 1 }} numberOfLines={2}>{p.name}</X>
        <View style={{ flexDirection: 'row', gap: u * 0.5 }}>
          {p.is_template ? <Pill>Template</Pill> : null}
          {p.retired ? <Pill t="off">Retired</Pill> : null}
        </View>
      </View>
      <View style={{ marginTop: u * 0.75, gap: u * 0.5 }}>
        {p.stages.length ? p.stages.map((s) => (
          <View key={s.stage_no} style={[{ flexDirection: 'row', alignItems: 'center', gap: u * 0.75, borderRadius: u * 1.25, paddingHorizontal: u, paddingVertical: u * 0.625 }, glassLo()]}>
            <X s={1} w="s" c={C.faint}>Stage {s.stage_no}</X>
            <X s={0.88} c={C.sub} style={{ flex: 1 }}>{s.games.map((g) => GAMES[g].name).join(', ') || s.label}</X>
          </View>
        )) : <Empty>No stages yet.</Empty>}
      </View>
      <View style={{ marginTop: u * 0.75, flexDirection: 'row', flexWrap: 'wrap', gap: u * 0.5 }}>
        {canEdit ? <Button size="sm" variant="secondary" label={p.retired ? 'Restore' : 'Retire'} loading={busy === 'retire'} onPress={flip} /> : null}
        <Button size="sm" variant="secondary" label={canEdit ? 'Edit stages' : 'View stages'} onPress={() => router.push(`/programs/${p.id}` as never)} />
      </View>
    </Card>
  );
}

function ProgramList() {
  const { u, tv } = useDevice();
  const can = useCan();
  const canCreate = can('MANAGE_PROGRAMS');
  const q = useGet<{ items: ProgramDTO[] }>('/programs');
  const items = q.data?.items ?? [];
  const [nw, setNw] = useState(false);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const { run, busy, fields } = useAction(['/programs']);

  async function create() {
    if (name.trim().length < 2) return setErr('Enter a program name.');
    setErr('');
    const r = await run('new', () => api.post<ProgramDTO>('/programs', { name: name.trim(), stages: [{ label: 'Stage 1', games: ['quick'] }] }), 'Program created.');
    if (r.ok) { setName(''); setNw(false); }
  }

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} testID="screen-programs" maxWidth={100000}>
      <Header eyebrow="Training programs" title="Programs" subtitle="A program unlocks games stage by stage. Retired programs are hidden from new assignments and can be restored." right={canCreate ? <Button label="New program" onPress={() => setNw(!nw)} /> : undefined} />
      <View style={{ height: u * 0.75 }} />
      {nw ? (
        <Card style={{ marginBottom: u }}>
          <Field label="Program name" required value={name} onChangeText={setName} error={err || fields.name} autoCapitalize="words" onSubmit={create} />
          <Button full label="Create program" loading={busy === 'new'} onPress={create} />
        </Card>
      ) : null}
      {q.isLoading ? (
        <LoadingBlock label="Loading programs" />
      ) : q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : items.length === 0 ? (
        <Empty>No programs yet.</Empty>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: u }}>
          {items.map((p) => (
            <View key={p.id} style={{ width: tv ? '49.2%' : '100%', flexGrow: tv ? 0 : 1, minWidth: 0 }}>
              <ProgramCard p={p} canEdit={canCreate} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

export default function ProgramsIndex() {
  return (
    <RequirePermission any={['MANAGE_PROGRAMS', 'VIEW_RESULTS']}>
      <ProgramList />
    </RequirePermission>
  );
}
