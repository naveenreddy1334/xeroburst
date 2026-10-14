// S16 Create player. On success the PIN is shown once on the credentials screen.

import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { validatePin } from '@nboard/shared';
import type { CreatePlayerBody, CreatedPlayerResponse, GameSlug, Page, ProgramDTO, UserDTO } from '@nboard/shared';
import { C } from '../../../theme/tokens';
import { useDevice } from '../../../theme/device';
import { ApiClientError } from '../../../lib/api';
import { useGet, useSend } from '../../../lib/queries';
import { useCan } from '../../../state/auth';
import { useCredentials } from '../../../state/ui';
import { RequirePermission } from '../../../ui/RequirePermission';
import { Screen } from '../../../ui/Screen';
import { Header } from '../../../ui/Header';
import { Button } from '../../../ui/Button';
import { Card } from '../../../ui/Card';
import { Chip } from '../../../ui/Chip';
import { Field } from '../../../ui/Field';
import { Txt } from '../../../ui/Txt';
import { EmptyBlock, ErrorBlock, LoadingBlock, errorText } from '../../../ui/States';
import { toast } from '../../../ui/Toast';
import { FieldErrors, GameChips, TvNotice } from '../../../staff/players-common';
import { checkPlayerCore, numOrUndef } from '../../../lib/validate';

function NewPlayerForm() {
  const router = useRouter();
  const { tv } = useDevice();
  const can = useCan();
  const pickCoach = can('MANAGE_COACHES');

  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState('');
  const [coachId, setCoachId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [games, setGames] = useState<GameSlug[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const coaches = useGet<Page<UserDTO>>('/users', { role: 'COACH', active: '1', limit: 100 }, { enabled: pickCoach && !tv });
  const programs = useGet<{ items: ProgramDTO[] }>('/programs', undefined, { enabled: !tv });
  const create = useSend<CreatedPlayerResponse, CreatePlayerBody>('post', '/players', ['/players', '/programs']);

  if (tv) {
    return (
      <Screen>
        <Header title="New player" back="/players" />
        <TvNotice />
      </Screen>
    );
  }

  async function submit() {
    const e: Record<string, string> = checkPlayerCore({ display_name: name, age, weight });
    const a = numOrUndef(age);
    const w = numOrUndef(weight);
    if (pin) {
      const bad = validatePin(pin);
      if (bad) e.pin = bad;
    }
    if (pickCoach && !coachId) e.coach_id = 'Choose a Coach for this player.';
    setErrs(e);
    if (Object.keys(e).length) return;

    const body: CreatePlayerBody = {
      display_name: name.trim(),
      age: a as number,
      weight_kg: w as number,
      notes: notes.trim() || null,
      ...(pin ? { pin } : {}),
      ...(pickCoach && coachId ? { coach_id: coachId } : {}),
      ...(programId ? { program_id: programId } : {}),
      ...(games.length ? { starting_games: games } : {}),
    };
    try {
      const r = await create.mutateAsync(body);
      useCredentials.getState().show({
        kind: 'player',
        name: r.player.display_name,
        loginId: r.credentials.login_id,
        secret: r.credentials.pin,
        secretLabel: 'PIN',
        note: 'Give these to the player. The PIN is not shown again.',
        back: '/players',
      });
      router.replace('/players/credentials' as never);
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.fields).length) setErrs(err.fields);
      toast(errorText(err), 'error');
    }
  }

  const activePrograms = (programs.data?.items ?? []).filter((p) => !p.retired);

  return (
    <Screen maxWidth={760} testID="screen-player-new">
      <Header title="New player" back="/players" />
      <Txt v="small">Fields marked * are required.</Txt>
      <Field label="Name" required value={name} onChangeText={setName} autoCapitalize="words" error={errs.display_name} placeholder="Full name" returnKeyType="next" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <Field label="Age" required value={age} onChangeText={setAge} keyboardType="number-pad" tvKeyboard="numeric" error={errs.age} placeholder="Years" />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 140 }}>
          <Field label="Weight (kg)" required value={weight} onChangeText={setWeight} keyboardType="decimal-pad" tvKeyboard="numeric" error={errs.weight_kg} placeholder="Kilograms" />
        </View>
      </View>
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline autoCapitalize="sentences" placeholder="Anything the coaching team should know" error={errs.notes} />
      <Field
        label="PIN (optional)"
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, ''))}
        keyboardType="number-pad"
        tvKeyboard="numeric"
        maxLength={12}
        error={errs.pin}
        hint="Leave blank and the server picks a 6-digit PIN."
      />

      {pickCoach ? (
        <View style={{ gap: 8 }}>
          <Txt v="label">Coach <Txt v="label" color={C.danger}>*</Txt></Txt>
          {coaches.isLoading ? (
            <LoadingBlock label="Loading coaches" />
          ) : coaches.isError ? (
            <ErrorBlock error={coaches.error} onRetry={() => void coaches.refetch()} />
          ) : !coaches.data?.items.length ? (
            <EmptyBlock icon="user" title="No active coaches" message="Create a Coach first, then add players." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {coaches.data.items.map((c) => (
                <Chip key={c.id} label={c.display_name} icon="user" selected={coachId === c.id} onPress={() => setCoachId(c.id)} />
              ))}
            </View>
          )}
          {errs.coach_id ? <Txt v="small" color={C.danger}>{errs.coach_id}</Txt> : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <Txt v="label">Program</Txt>
        {programs.isLoading ? (
          <LoadingBlock label="Loading programs" />
        ) : programs.isError ? (
          <ErrorBlock error={programs.error} onRetry={() => void programs.refetch()} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="No program" selected={programId === null} onPress={() => setProgramId(null)} />
            {activePrograms.map((p) => (
              <Chip key={p.id} label={p.name} icon="list" selected={programId === p.id} onPress={() => setProgramId(p.id)} />
            ))}
          </View>
        )}
        {errs.program_id ? <Txt v="small" color={C.danger}>{errs.program_id}</Txt> : null}
      </View>

      <Card style={{ gap: 10 }}>
        <Txt v="h3">Starting games</Txt>
        <Txt v="small">{programId ? 'Games from stage 1 of the program unlock on their own. Pick extra games to unlock now.' : 'Leave empty to start with Quick Reaction only.'}</Txt>
        <GameChips value={games} onToggle={(g) => setGames((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]))} />
      </Card>

      <FieldErrors fields={errs} skip={['display_name', 'age', 'weight_kg', 'notes', 'pin', 'coach_id', 'program_id']} />
      <Button label="Create player" size="lg" full icon="plus" loading={create.isPending} onPress={submit} />
    </Screen>
  );
}

export default function NewPlayer() {
  return (
    <RequirePermission any={['MANAGE_PLAYERS']}>
      <NewPlayerForm />
    </RequirePermission>
  );
}
