// S19 Program editor. The id "new" creates a program.

import { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GAMES } from '@nboard/shared';
import type { GameSlug, ProgramBody, ProgramDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { useDevice } from '../../../theme/device';
import { api } from '../../../lib/api';
import { useGet } from '../../../lib/queries';
import { useAuth, useCan } from '../../../state/auth';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Badge } from '../../../ui/Chip';
import { Dialog } from '../../../ui/Dialog';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Toggle } from '../../../ui/Toggle';
import { Txt } from '../../../ui/Txt';
import { FieldErrors, GameBadges, GameChips, IconButton, TvNotice, useAction } from '../../../staff/players-common';

interface Draft {
  name: string;
  is_template: boolean;
  retired: boolean;
  stages: { label: string; games: GameSlug[] }[];
}

const MAX_STAGES = 12;

const fromDto = (p: ProgramDTO): Draft => ({
  name: p.name,
  is_template: p.is_template,
  retired: p.retired,
  stages: p.stages.map((s) => ({ label: s.label, games: [...s.games] })),
});

const blank = (): Draft => ({ name: '', is_template: true, retired: false, stages: [{ label: 'Week 1', games: ['quick'] }] });

function Rule() {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.primaryDim, borderRadius: 12, borderWidth: 1.5, borderColor: C.primary, padding: 12 }}>
      <Icon name="list" size={20} color={C.highlight} />
      <Txt v="small" color={C.text} style={{ flex: 1 }}>
        A stage unlocks its games plus all games of earlier stages.
      </Txt>
    </View>
  );
}

function Editor({ id, program }: { id: string; program: ProgramDTO | null }) {
  const router = useRouter();
  const role = useAuth((s) => s.user?.role);
  const { run, busy, fields } = useAction(['/programs', '/players']);
  const [d, setD] = useState<Draft>(() => (program ? fromDto(program) : blank()));
  const [localErr, setLocalErr] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = id === 'new';
  const err = { ...fields, ...localErr };

  const patchStage = (i: number, fn: (s: Draft['stages'][number]) => Draft['stages'][number]) => setD((cur) => ({ ...cur, stages: cur.stages.map((s, j) => (j === i ? fn(s) : s)) }));
  const move = (i: number, dir: -1 | 1) =>
    setD((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.stages.length) return cur;
      const st = [...cur.stages];
      [st[i], st[j]] = [st[j]!, st[i]!];
      return { ...cur, stages: st };
    });

  async function save() {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e.name = 'Give the program a name.';
    if (d.stages.some((s) => !s.label.trim())) e.stages = 'Every stage needs a label.';
    setLocalErr(e);
    if (Object.keys(e).length) return;
    const body: ProgramBody = {
      name: d.name.trim(),
      retired: d.retired,
      ...(role !== 'COACH' ? { is_template: d.is_template } : {}),
      stages: d.stages.map((s) => ({ label: s.label.trim(), games: s.games })),
    };
    const r = await run('save', () => (isNew ? api.post<ProgramDTO>('/programs', body) : api.patch<ProgramDTO>(`/programs/${id}`, body)), isNew ? 'Program created' : 'Program saved');
    if (!r.ok) return;
    if (isNew) router.replace(`/programs/${r.value.id}` as never);
    else setD(fromDto(r.value));
  }

  async function remove() {
    const r = await run('delete', () => api.del(`/programs/${id}`), 'Program deleted');
    setConfirmDelete(false);
    if (r.ok) router.replace('/programs' as never);
  }

  return (
    <>
      <Rule />
      <Field label="Name" value={d.name} onChangeText={(v) => setD({ ...d, name: v })} autoCapitalize="words" placeholder="For example Beginner 4 weeks" error={err.name} />
      {role !== 'COACH' ? <Toggle label="Shared template" hint="Templates can be used by every Coach." value={d.is_template} onChange={(v) => setD({ ...d, is_template: v })} /> : null}
      {!isNew ? <Toggle label="Retired" hint="Retired programs cannot be given to new players." value={d.retired} onChange={(v) => setD({ ...d, retired: v })} onLabel="RETIRED" offLabel="IN USE" color={C.warning} /> : null}

      <Txt v="h2">Stages</Txt>
      {d.stages.map((s, i) => {
        const earlier = [...new Set(d.stages.slice(0, i).flatMap((x) => x.games))].filter((g) => !s.games.includes(g));
        return (
          <Card key={i} style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Txt v="mono" color={C.highlight}>
                {i + 1}
              </Txt>
              <View style={{ flex: 1 }} />
              <IconButton icon="chevronDown" label="Move stage up" rotate={180} disabled={i === 0} onPress={() => move(i, -1)} />
              <IconButton icon="chevronDown" label="Move stage down" disabled={i === d.stages.length - 1} onPress={() => move(i, 1)} />
              <IconButton icon="trash" label="Remove stage" color={C.danger} disabled={d.stages.length <= 1} onPress={() => setD((cur) => ({ ...cur, stages: cur.stages.filter((_, j) => j !== i) }))} />
            </View>
            <Field label="Label" value={s.label} onChangeText={(v) => patchStage(i, (x) => ({ ...x, label: v }))} autoCapitalize="words" maxLength={40} />
            <Txt v="label">Games added at this stage</Txt>
            <GameChips value={s.games} onToggle={(g) => patchStage(i, (x) => ({ ...x, games: x.games.includes(g) ? x.games.filter((y) => y !== g) : [...x.games, g] }))} />
            {earlier.length ? (
              <View style={{ gap: 6 }}>
                <Txt v="small">Also open from earlier stages</Txt>
                <GameBadges games={earlier} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {err.stages ? <Txt v="small" color={C.danger}>{err.stages}</Txt> : null}
      <Button label="Add stage" icon="plus" variant="secondary" disabled={d.stages.length >= MAX_STAGES} onPress={() => setD((cur) => ({ ...cur, stages: [...cur.stages, { label: `Week ${cur.stages.length + 1}`, games: [] }] }))} />

      <FieldErrors fields={err} skip={['name', 'stages']} />
      <Button label={isNew ? 'Create program' : 'Save changes'} size="lg" full icon="check" loading={busy === 'save'} onPress={save} />
      {!isNew ? <Button label="Delete program" variant="danger" icon="trash" full onPress={() => setConfirmDelete(true)} /> : null}

      <Dialog visible={confirmDelete} title="Delete program" message={`Delete "${program?.name ?? ''}"? This cannot be undone. A program that players use must be retired instead.`} confirmLabel="Delete" danger loading={busy === 'delete'} onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
    </>
  );
}

function ReadOnly({ p }: { p: ProgramDTO }) {
  return (
    <>
      <Rule />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {p.is_template ? <Badge label="Template" icon="doc" color={C.secondary} /> : null}
        {p.retired ? <Badge label="Retired" color={C.lockedText} /> : null}
        <Badge label={`${p.players_using} using`} icon="users" color={C.sub} />
      </View>
      {p.stages.map((s) => (
        <Card key={s.stage_no} style={{ gap: 8 }}>
          <Txt v="h3">
            {s.stage_no}. {s.label}
          </Txt>
          <GameBadges games={s.games} />
        </Card>
      ))}
    </>
  );
}

function ProgramScreen() {
  const { id: raw } = useLocalSearchParams<{ id: string }>();
  const id = String(raw);
  const { tv } = useDevice();
  const can = useCan();
  const role = useAuth((s) => s.user?.role);
  const userId = useAuth((s) => s.user?.id);
  const isNew = id === 'new';
  const q = useGet<ProgramDTO>(isNew ? null : `/programs/${id}`);
  const p = q.data ?? null;
  const editable = can('MANAGE_PROGRAMS') && !tv && (isNew || role !== 'COACH' || p?.owner_id === userId);

  return (
    <Screen maxWidth={760} refreshing={!isNew && q.isRefetching} onRefresh={isNew ? undefined : () => void q.refetch()} testID="screen-program">
      <Header title={isNew ? 'New program' : p?.name ?? 'Program'} back="/programs" />
      {tv ? <TvNotice /> : null}
      {isNew ? (
        editable ? <Editor id={id} program={null} /> : null
      ) : q.isLoading ? (
        <LoadingBlock label="Loading program" />
      ) : q.isError || !p ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : editable ? (
        <Editor key={p.id} id={id} program={p} />
      ) : (
        <ReadOnly p={p} />
      )}
    </Screen>
  );
}

export default function ProgramEditor() {
  return (
    <RequirePermission any={['MANAGE_PROGRAMS', 'VIEW_RESULTS']}>
      <ProgramScreen />
    </RequirePermission>
  );
}
